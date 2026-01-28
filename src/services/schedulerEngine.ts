/**
 * Auto Scheduler Engine
 * Generates fair, constraint-aware monthly schedules.
 *
 * 排班原則（在無其他條件限制下的基本規則）：
 * 1. 下月排班時，先看上月「欠」(carry)：欠越多越優先安排，先把欠的補足再排其他。
 * 2. 假日：每人須先排到至少一天假日（WE_AM/WE_MD/WE_PM 任一），優先達成後再排其餘。
 * 3. 平日早、晚：每人須至少排到一天平日早班、一天平日晚班；平日僅早、晚時，兩者比例平均（如 4 天→早 2、晚 2）。
 * 4. 有特殊條件者優先排班：先算平日班平均值取整為「基礎」（如 3.67→3）；有規則者至少排到基礎，且須 2早1晚 或 1早2晚（不可 3+0、0+3）。
 * 5. 剩餘時段：上述保障完成後，依序填滿。
 * 6. 分數與沖銷：排完後依 target 與實際差計算 carry；欠越多下月優先補還。
 *
 * 隨機機制：
 * (1) 填格「順序」隨機：每次 attempt 將所有待填 (日期, 班別) 打亂後再枚舉，避免固定週五、
 *     週四等同一星期、同一日期總是先被填，導致某人永遠排在同一天。
 * (2) 人選在同等級內隨機：依條件對候選人排序後，在分數差距 ≤ RANDOM_TOP_TIER_TOLERANCE
 *     的候選中隨機抽選；無強條件區隔的格也能隨機分配。
 * 在可排班範圍內做日期的隨機調整，每次自動／重新生成結果不同，仍遵守所有設定條件。
 *
 * 班次間隔（軟性）：盡量讓兩班之間至少間隔 GAP_MIN_DAYS 天，理想 3–5 天；間隔不足時
 * 對該候選加分（懲罰），排程時會傾向選擇間隔較足的人，但非硬性排除。
 *
 * 班別間隔（軟性）：班別只能1班之差去排班（AM→AM/MD, MD→AM/PM, PM→MD/PM），
 * 若跳過一級（如 AM→PM 或 PM→AM）則加懲罰，排程時會傾向選擇班別連續的人。
 */

import type { Member, RosterSlot, SlotCode, ScheduleReport, DutyBalance } from '@/types';
import {
  getMembers,
  getRules,
  getRosterSlots,
  setRosterSlot,
  clearMonthDraft,
  getFairnessSettings,
  getAllDutyBalance,
  isAvailable,
  getSameDayPairs,
  saveVersion,
  getAllRosterSlots,
  estimateAvailableSlots,
  countAvailableSlotsForType,
} from './dataService';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  getDaysInMonth,
  getSlotCodesForDay,
  getPreviousDay,
  isPMSlot,
  isAMSlot,
  countSlotsInMonth,
  formatMonth,
} from '@/lib/utils';
import { SCHEDULING_ORDER } from '@/lib/constants';

interface CandidateScore {
  member: Member;
  score: number;
  reasons: string[];
}

interface ScheduleResult {
  success: boolean;
  slots: RosterSlot[];
  missingCount: number;
  report: ScheduleReport;
}

// Get eligible members (active and not excluded)
function getEligibleMembers(): Member[] {
  return getMembers().filter(m => m.is_active && !m.exclude_roster);
}

// Check if member already has max shifts on this day
function hasMaxShiftsOnDay(memberId: string, date: string, currentSlots: RosterSlot[], maxPerDay: number): boolean {
  const daySlots = currentSlots.filter(s => s.date === date && s.assignee_id === memberId);
  return daySlots.length >= maxPerDay;
}

// Check if member had PM shift yesterday (for close-to-open rule)
function hadPMShiftYesterday(memberId: string, date: string, currentSlots: RosterSlot[], allSlots: RosterSlot[]): boolean {
  const prevDate = getPreviousDay(date);
  const prevSlots = [...currentSlots, ...allSlots].filter(s => s.date === prevDate && s.assignee_id === memberId);
  return prevSlots.some(s => isPMSlot(s.slot_code));
}

function getPartner(memberId: string): string | null {
  for (const [a, b] of getSameDayPairs()) {
    if (a === memberId) return b;
    if (b === memberId) return a;
  }
  return null;
}

function isFilled(date: string, slotCode: SlotCode, currentSlots: RosterSlot[]): boolean {
  return currentSlots.some(c => c.date === date && c.slot_code === slotCode);
}

/** 該格若排某人，是否能「完成」同天搭檔：搭檔 A 已在此日、B 尚未，且 B 可排此 (date, slotCode)。 */
async function canCompletePair(date: string, slotCode: SlotCode, currentSlots: RosterSlot[]): Promise<boolean> {
  const pairs = getSameDayPairs();
  for (const [a, b] of pairs) {
    if (currentSlots.some(c => c.date === date && c.assignee_id === a) && !currentSlots.some(c => c.date === date && c.assignee_id === b)) {
      const av = await isAvailable(b, date, slotCode);
      if (av.available) return true;
    }
    if (currentSlots.some(c => c.date === date && c.assignee_id === b) && !currentSlots.some(c => c.date === date && c.assignee_id === a)) {
      const av = await isAvailable(a, date, slotCode);
      if (av.available) return true;
    }
  }
  return false;
}

// 上月 carry 的權重：欠越多越優先補、超越多越延後；越差越多下月越要往均值拉。
const CARRY_OWE_WEIGHT = 220;
// 累進倍率：|總 carry| 愈大，該員的 carry 加權愈強（欠 2.6 比 欠 0.6 更積極補、超 1.4 更積極少排）。
const CARRY_PROGRESSIVE_FACTOR = 0.25;

// 排班優先：有較多規則（較不彈性）的成員先排，再排彈性。權重：每條有效規則略降分。
const RESTRICTED_PRIORITY_WEIGHT = 0.03;

// 有特殊條件者：平日班未達「基礎」（平均值取整）時，每少 1 班減分以強優先，先排到基礎（如 3 班＝2早1晚 或 1早2晚）。
const RESTRICTED_WD_BASE_PRIORITY = 400;

// 平日早晚須平衡：排到基礎時不可 3+0 或 0+3，須 2+1 或 1+2；若此格會造成全早或全晚則加懲罰。
const WD_IMBALANCE_PENALTY = 800;

// 每人須先有 1 假日、1 平日早、1 平日晚；尚未達成者優先，已達成者加此懲罰以延後排入。
const MINIMUM_NOT_MET_PENALTY = 1000;

// 平日班次以 3～4 天為原則，不應排到 5 天。
// 排平日班時，依「平日班總數」優先給少的人：愈多愈加懲罰，避免有人 5 天、有人還 3 天。
const WD_TOTAL_WEIGHT = 200;

// 依「總班數」(平日+假日) 拉平：總數愈少愈優先，避免有人 3+2、有人 4+3 導致分數(carry)差太多。
const TOTAL_SHIFT_WEIGHT = 80;

// 總班數已超過目標（平均值）者加懲罰：避免 5 分、2 分差太多，把多的班留給未達標的人（如 每週四可排 的以蓁應可排到 ~4）。
const OVER_TARGET_WEIGHT = 350;

// 總班數未達目標者減分（優先排）：讓 2 分的人明顯優先於 5 分的人，拉近 5 vs 2 的差距。
const UNDER_TARGET_WEIGHT = 200;

// 同天搭檔：若搭檔已在該日有班，或自己可排且搭檔也能排到該日另一時段，則優先／允許。
const SAME_DAY_PAIR_BONUS = 300;

/** 同等級容差：分數在此範圍內視為「同等」，從中隨機抽選。差距大於此者仍依排序，不隨機越級。 */
const RANDOM_TOP_TIER_TOLERANCE = 80;

/** 班次間隔：理想至少隔幾天，不足時加懲罰（軟性，非硬性）。 */
const GAP_MIN_DAYS = 3;
/** 間隔不足時，每少 1 天加的分數；連續日或隔 1 日會明顯被扣。 */
const SHIFT_TOO_CLOSE_PENALTY = 150;

/** 班別跳級懲罰：班別只能1班之差（AM→AM/MD, MD→AM/PM, PM→MD/PM），跳過一級時加此懲罰。 */
const SHIFT_TYPE_JUMP_PENALTY = 200;

/**
 * 依條件排序後，在「與最佳分數差距 ≤ tolerance」的候選中隨機抽選一人。
 * 確保每次生成在無強條件區隔時仍有隨機性，同時遵守排序。
 */
function pickRandomFromTopTier(
  candidates: CandidateScore[],
  tolerance: number
): CandidateScore | null {
  if (candidates.length === 0) return null;
  const best = Math.min(...candidates.map((c) => c.score));
  const top = candidates.filter((c) => c.score <= best + tolerance);
  return top[Math.floor(Math.random() * top.length)] ?? null;
}

/** Fisher–Yates 隨機打亂陣列，使每次填格順序不同，避免固定於同一星期或日期。 */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * 取得班別類型：AM=1, MD=2, PM=3
 * 用於計算班別間隔，確保只能1班之差。
 */
function getShiftType(slotCode: SlotCode): number {
  if (slotCode === 'WD_AM' || slotCode === 'WE_AM') return 1; // AM
  if (slotCode === 'WE_MD') return 2; // MD
  if (slotCode === 'WD_PM' || slotCode === 'WE_PM') return 3; // PM
  return 2; // 預設
}

interface GetCandidatesOpts {
  round1?: boolean;
  cap1Map?: Map<string, number>;
  round2?: boolean;
}

// Get candidates for a slot
async function getCandidates(
  date: string,
  slotCode: SlotCode,
  currentSlots: RosterSlot[],
  allSlots: RosterSlot[],
  opts?: GetCandidatesOpts
): Promise<CandidateScore[]> {
  const settings = getFairnessSettings();
  const members = getEligibleMembers();
  const allRules = await getRules();
  const month = formatMonth(date);
  const slotCounts = countSlotsInMonth(month);
  const eligibleCount = members.length;
  
  const allBalance = getAllDutyBalance();

  // 平日班基礎＝平均值取整；有特殊條件者至少排到基礎，且須 2早1晚 或 1早2晚（不可 3+0、0+3）
  const wdBase = eligibleCount > 0
    ? Math.floor((slotCounts.WD_AM + slotCounts.WD_PM) / eligibleCount)
    : 0;

  // 每人目標總班數（當月總格數÷人數）；超過者加懲罰，讓 5 分、2 分懸殊時優先排給未達標
  const targetTotal = eligibleCount > 0
    ? (slotCounts.WD_AM + slotCounts.WD_PM + slotCounts.WE_AM + slotCounts.WE_MD + slotCounts.WE_PM) / eligibleCount
    : 0;

  const isWESlot = slotCode === 'WE_AM' || slotCode === 'WE_MD' || slotCode === 'WE_PM';
  const isWDAM = slotCode === 'WD_AM';
  const isWDPM = slotCode === 'WD_PM';
  const anyNeedsWE = isWESlot && members.some(m => {
    const n = currentSlots.filter(s => s.assignee_id === m.id && (s.slot_code === 'WE_AM' || s.slot_code === 'WE_MD' || s.slot_code === 'WE_PM')).length;
    return n === 0;
  });
  const anyNeedsWDAM = isWDAM && members.some(m => {
    const n = currentSlots.filter(s => s.assignee_id === m.id && s.slot_code === 'WD_AM').length;
    return n === 0;
  });
  const anyNeedsWDPM = isWDPM && members.some(m => {
    const n = currentSlots.filter(s => s.assignee_id === m.id && s.slot_code === 'WD_PM').length;
    return n === 0;
  });
  
  const candidates: CandidateScore[] = [];
  
  for (const member of members) {
    const reasons: string[] = [];
    let eligible = true;
    
    // Check availability rules
    const avail = await isAvailable(member.id, date, slotCode);
    if (!avail.available) {
      eligible = false;
      reasons.push(avail.reason || '規則限制');
    }
    
    // Check max shifts per day
    const maxPerDay = settings.allow_two_shifts_per_day ? 2 : (member.max_shifts_per_day || settings.max_shifts_per_day);
    if (hasMaxShiftsOnDay(member.id, date, currentSlots, maxPerDay)) {
      eligible = false;
      reasons.push('當日已達上限');
    }
    
    // Check close-to-open rule
    if (settings.no_close_to_open && isAMSlot(slotCode)) {
      if (hadPMShiftYesterday(member.id, date, currentSlots, allSlots)) {
        if (!settings.allow_soften_close_to_open) {
          eligible = false;
          reasons.push('晚→早禁止');
        }
      }
    }
    
    // 同天搭檔：若 M 有搭檔 P（且 P 在排班名單內）且 P 尚無該日班，則 P 須能在該日另一未填時段排到，否則 M 不可排此格
    const partnerId = getPartner(member.id);
    const partner = partnerId && members.some(m => m.id === partnerId) ? partnerId : null;
    if (partner) {
      const partnerOnDate = currentSlots.some(c => c.date === date && c.assignee_id === partner);
      if (!partnerOnDate) {
        const otherSlots = getSlotCodesForDay(date).filter(s => s !== slotCode);
        const remaining = otherSlots.filter(S => !currentSlots.some(c => c.date === date && c.slot_code === S));
        let partnerCanJoin = false;
        for (const S of remaining) {
          const av = await isAvailable(partner, date, S);
          if (av.available) { partnerCanJoin = true; break; }
        }
        if (!partnerCanJoin) {
          eligible = false;
          reasons.push('同天搭檔此日無可排時段');
        }
      }
    }
    
    if (!eligible) {
      continue;
    }
    
    const activeRuleCount = allRules.filter(r => r.member_id === member.id && r.is_active).length;
    // 第一輪：僅有特殊條件者，且未達 cap1
    if (opts?.round1 && (activeRuleCount < 1 || currentSlots.filter(s => s.assignee_id === member.id).length >= (opts.cap1Map?.get(member.id) ?? 0)))
      continue;
    // 第二輪：僅其搭檔已在該日有班者（可完成同天搭檔）
    if (opts?.round2) {
      const p = getPartner(member.id);
      if (!p || !currentSlots.some(c => c.date === date && c.assignee_id === p)) continue;
    }
    
    // Calculate score (lower is better)
    let score = 0;
    
    // Count current month assignments for this slot type
    const currentMonthAssigned = currentSlots.filter(
      s => s.assignee_id === member.id && s.slot_code === slotCode
    ).length;
    
    // Target for this slot type
    const target = slotCounts[slotCode] / eligibleCount;
    
    // Penalty for exceeding target
    score += (currentMonthAssigned / target) * settings.slot_weights[slotCode];
    
    // 上月 carry：取最近一筆已出版月份的 DutyBalance；該班型 carry 正＝欠、負＝超
    const prior = allBalance
      .filter(b => b.member_id === member.id && b.month < month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    let carryAmount = 0;
    let totalCarry = 0;
    if (prior) {
      totalCarry = prior.carry_WD_AM + prior.carry_WD_PM + prior.carry_WE_AM + prior.carry_WE_MD + prior.carry_WE_PM;
      switch (slotCode) {
        case 'WD_AM': carryAmount = prior.carry_WD_AM; break;
        case 'WD_PM': carryAmount = prior.carry_WD_PM; break;
        case 'WE_AM': carryAmount = prior.carry_WE_AM; break;
        case 'WE_MD': carryAmount = prior.carry_WE_MD; break;
        case 'WE_PM': carryAmount = prior.carry_WE_PM; break;
      }
    }
    // 欠越多分數越低越優先排；超越多分數越高越延後。越差越多（|totalCarry| 大）下月愈要往均值拉，加累進倍率
    const carryMult = 1 + CARRY_PROGRESSIVE_FACTOR * Math.abs(totalCarry);
    score -= carryAmount * CARRY_OWE_WEIGHT * settings.carry_strength * carryMult;
    
    // 每人須先有 1 假日、1 平日早、1 平日晚；尚未達成者不扣分，已達成者加懲罰以延後
    const weCount = currentSlots.filter(s => s.assignee_id === member.id && (s.slot_code === 'WE_AM' || s.slot_code === 'WE_MD' || s.slot_code === 'WE_PM')).length;
    const wdAmCount = currentSlots.filter(s => s.assignee_id === member.id && s.slot_code === 'WD_AM').length;
    const wdPmCount = currentSlots.filter(s => s.assignee_id === member.id && s.slot_code === 'WD_PM').length;
    if (anyNeedsWE && weCount >= 1) score += MINIMUM_NOT_MET_PENALTY;
    if (anyNeedsWDAM && wdAmCount >= 1) score += MINIMUM_NOT_MET_PENALTY;
    if (anyNeedsWDPM && wdPmCount >= 1) score += MINIMUM_NOT_MET_PENALTY;
    
    // 排平日班時，依平日班總數優先給少的人：3 天的比 4 天的優先，避免有人 5 天、有人還 3 天
    const wdTotal = wdAmCount + wdPmCount;
    if (isWDAM || isWDPM) score += wdTotal * WD_TOTAL_WEIGHT;
    
    // 依總班數(平日+假日)拉平：3+2 比 4+3 優先，避免有人分數(carry)高很多
    const totalShifts = weCount + wdAmCount + wdPmCount;
    score += totalShifts * TOTAL_SHIFT_WEIGHT;
    // 總班數已超過目標者加懲罰：避免 5 vs 2 懸殊，晚班等應先留給未達標的人（如 每週四可排 者至少應能排到 ~4）
    if (targetTotal > 0 && totalShifts > targetTotal)
      score += (totalShifts - targetTotal) * OVER_TARGET_WEIGHT;
    // 總班數未達目標者減分（優先排）：2 分的人明顯優先於 5 分的人
    if (targetTotal > 0 && totalShifts < targetTotal)
      score -= (targetTotal - totalShifts) * UNDER_TARGET_WEIGHT;
    
    // 有條件／特殊需求者優先：規則愈多（可排時段愈少）愈先排，先排完特殊再排彈性
    score -= activeRuleCount * RESTRICTED_PRIORITY_WEIGHT;
    
    // 有特殊條件者：平日班未達「基礎」（平均值取整）時強優先，至少排到基礎（例：基礎 3＝2早1晚 或 1早2晚）
    if ((isWDAM || isWDPM) && wdBase > 0 && activeRuleCount >= 1 && wdTotal < wdBase)
      score -= (wdBase - wdTotal) * RESTRICTED_WD_BASE_PRIORITY;
    
    // 平日早晚須平衡：排到基礎時不可全早或全晚（3+0、0+3），須 2+1 或 1+2；基礎 1 時 1+0 或 0+1 為唯一解故不罰
    if ((isWDAM || isWDPM) && wdBase >= 2) {
      const afterAM = wdAmCount + (isWDAM ? 1 : 0);
      const afterPM = wdPmCount + (isWDPM ? 1 : 0);
      if (afterAM + afterPM >= wdBase && (afterAM === 0 || afterPM === 0))
        score += WD_IMBALANCE_PENALTY;
    }
    
    // 同天搭檔：搭檔已在該日有班時，自己排此格可與搭檔同天，減分優先
    if (partner && currentSlots.some(c => c.date === date && c.assignee_id === partner))
      score -= SAME_DAY_PAIR_BONUS;
    
    // 班次間隔（軟性）：與前一班、後一班間隔至少 GAP_MIN_DAYS 天，不足則加懲罰
    const combined = [...currentSlots, ...allSlots].filter(s => s.assignee_id === member.id);
    const priorDates = [...new Set(combined.filter(s => s.date < date).map(s => s.date))];
    const nextDates = [...new Set(combined.filter(s => s.date > date).map(s => s.date))];
    const priorDate = priorDates.length > 0 ? priorDates.sort().at(-1)! : null;
    const nextDate = nextDates.length > 0 ? nextDates.sort()[0] : null;
    const gapPrior = priorDate ? differenceInCalendarDays(parseISO(date), parseISO(priorDate)) : 999;
    const gapNext = nextDate ? differenceInCalendarDays(parseISO(nextDate), parseISO(date)) : 999;
    if (gapPrior < GAP_MIN_DAYS) score += (GAP_MIN_DAYS - gapPrior) * SHIFT_TOO_CLOSE_PENALTY;
    if (gapNext < GAP_MIN_DAYS) score += (GAP_MIN_DAYS - gapNext) * SHIFT_TOO_CLOSE_PENALTY;
    
    // 班別間隔（軟性）：班別只能1班之差（AM→AM/MD, MD→AM/PM, PM→MD/PM），跳過一級時加懲罰
    const currentShiftType = getShiftType(slotCode);
    if (priorDate) {
      // 找到最近一次班別的類型
      const priorSlots = combined.filter(s => s.date === priorDate);
      if (priorSlots.length > 0) {
        // 取最近一次班別（如果同一天有多個班別，取最後一個）
        const lastSlot = priorSlots.sort((a, b) => {
          const aType = getShiftType(a.slot_code);
          const bType = getShiftType(b.slot_code);
          return bType - aType; // 優先取較晚的班別（PM > MD > AM）
        })[0];
        const lastShiftType = getShiftType(lastSlot.slot_code);
        const typeDiff = Math.abs(currentShiftType - lastShiftType);
        if (typeDiff > 1) {
          score += (typeDiff - 1) * SHIFT_TYPE_JUMP_PENALTY;
        }
      }
    }
    if (nextDate) {
      // 檢查與下一班的班別間隔
      const nextSlots = combined.filter(s => s.date === nextDate);
      if (nextSlots.length > 0) {
        const nextSlot = nextSlots.sort((a, b) => {
          const aType = getShiftType(a.slot_code);
          const bType = getShiftType(b.slot_code);
          return aType - bType; // 優先取較早的班別（AM < MD < PM）
        })[0];
        const nextShiftType = getShiftType(nextSlot.slot_code);
        const typeDiff = Math.abs(nextShiftType - currentShiftType);
        if (typeDiff > 1) {
          score += (typeDiff - 1) * SHIFT_TYPE_JUMP_PENALTY;
        }
      }
    }
    
    candidates.push({ member, score, reasons });
  }
  
  // Sort by score (lower is better)；最後人選由 pickRandomFromTopTier 在同等級中隨機抽選
  return candidates.sort((a, b) => a.score - b.score);
}

// Generate schedule for a month
// 若有當月已手排（assignee_id 已有值），一律保留，僅對「剩餘空格」依三輪規則自動補上。
export async function generateSchedule(month: string): Promise<ScheduleResult> {
  const settings = getFairnessSettings();
  const allExistingSlots = getAllRosterSlots().filter(s => !s.date.startsWith(month));
  
  // 已排：當月已有 assignee 的格（手排或先前自動），保留不 overwrite。排除「全員不排班」日的格。
  const existingInMonth = getRosterSlots(month);
  const seed = existingInMonth.filter(
    s => s.assignee_id != null && getSlotCodesForDay(s.date).includes(s.slot_code)
  );
  const filledSet = new Set(seed.map(s => `${s.date}\t${s.slot_code}`));
  
  const days = getDaysInMonth(month);
  const fullSlots: Array<{ date: string; slotCode: SlotCode }> = [];
  for (const slotCode of SCHEDULING_ORDER) {
    for (const date of days) {
      const daySlots = getSlotCodesForDay(date);
      if (daySlots.includes(slotCode)) fullSlots.push({ date, slotCode });
    }
  }
  // 只對「尚未排」的格做自動填入（不在此做固定排序，改為每個 attempt 內隨機打亂）
  const slotsToFill = fullSlots.filter(s => !filledSet.has(`${s.date}\t${s.slotCode}`));
  
  let bestResult: ScheduleResult | null = null;
  
  for (let attempt = 0; attempt < settings.max_retries; attempt++) {
    // 每次 attempt 打亂填格順序，避免固定於週四、週五或特定日期
    const order = [...slotsToFill];
    shuffleArray(order);
    
    // 從已排的格開始，再依三輪補剩餘
    const currentSlots: RosterSlot[] = [...seed];
    
    // 第一輪 cap1：有特殊條件者本輪上限 = min(可排格數, 平日基礎 + (有欠?1:0))
    const members = getEligibleMembers();
    const slotCounts = countSlotsInMonth(month);
    const eligibleCount = members.length;
    const wdBase = eligibleCount > 0 ? Math.floor((slotCounts.WD_AM + slotCounts.WD_PM) / eligibleCount) : 0;
    const allBalance = getAllDutyBalance();
    const allRulesForCap = await getRules();
    const cap1Map = new Map<string, number>();
    for (const m of members) {
      const ar = allRulesForCap.filter(r => r.member_id === m.id && r.is_active);
      if (ar.length < 1) { cap1Map.set(m.id, 0); continue; }
      const est = await estimateAvailableSlots(m.id, month);
      const prior = allBalance.filter(b => b.member_id === m.id && b.month < month).sort((x, y) => y.month.localeCompare(x.month))[0];
      const totalCarry = prior ? (prior.carry_WD_AM + prior.carry_WD_PM + prior.carry_WE_AM + prior.carry_WE_MD + prior.carry_WE_PM) : 0;
      const owe = totalCarry > 0;
      const over = totalCarry < 0;
      const cap1 = Math.max(0, Math.min(est, wdBase + (owe ? 1 : 0) - (over ? 1 : 0)));
      cap1Map.set(m.id, cap1);
    }
    
    const pushSlot = (date: string, slotCode: SlotCode, assigneeId: string | null) => {
      currentSlots.push({ date, slot_code: slotCode, assignee_id: assigneeId, is_substitute: false, original_assignee_id: null, status: 'draft', updated_at: new Date().toISOString() });
    };
    
    // 第一輪：特殊條件優先（有規則者、且未達 cap1）。填格順序為 order（已打亂），同等級內隨機抽選。
    for (const { date, slotCode } of order) {
      if (isFilled(date, slotCode, currentSlots)) continue;
      const cand = await getCandidates(date, slotCode, currentSlots, allExistingSlots, { round1: true, cap1Map });
      const p = pickRandomFromTopTier(cand, RANDOM_TOP_TIER_TOLERANCE);
      if (p) pushSlot(date, slotCode, p.member.id);
    }
    // 第二輪：組隊／同天搭檔（可完成同天搭檔的格）。填格順序為 order，同等級內隨機抽選。
    for (const { date, slotCode } of order) {
      if (isFilled(date, slotCode, currentSlots)) continue;
      if (!(await canCompletePair(date, slotCode, currentSlots))) continue;
      const cand = await getCandidates(date, slotCode, currentSlots, allExistingSlots, { round2: true });
      const p = pickRandomFromTopTier(cand, RANDOM_TOP_TIER_TOLERANCE);
      if (p) pushSlot(date, slotCode, p.member.id);
    }
    // 第三輪：其餘依條件排序後，在同等級內隨機抽選；無符合條件者留缺。填格順序為 order。
    for (const { date, slotCode } of order) {
      if (isFilled(date, slotCode, currentSlots)) continue;
      const cand = await getCandidates(date, slotCode, currentSlots, allExistingSlots, {});
      const p = pickRandomFromTopTier(cand, RANDOM_TOP_TIER_TOLERANCE);
      pushSlot(date, slotCode, p ? p.member.id : null);
    }
    
    const missingCount = currentSlots.filter(s => s.assignee_id === null).length;
    const report = await generateReport(month, currentSlots);
    
    const result: ScheduleResult = {
      success: missingCount === 0,
      slots: currentSlots,
      missingCount,
      report,
    };
    
    if (!bestResult || missingCount < bestResult.missingCount) {
      bestResult = result;
    }
    
    if (missingCount === 0) {
      break;
    }
  }
  
  if (!bestResult) {
    throw new Error('Failed to generate schedule');
  }
  
  // 不 clearMonthDraft，以保留己手排；只寫入 bestResult（已含 seed + 新補上的）
  bestResult.slots.forEach(slot => {
    setRosterSlot(slot.date, slot.slot_code, slot.assignee_id, {
      is_substitute: slot.is_substitute,
      original_assignee_id: slot.original_assignee_id ?? null,
      status: slot.status || 'draft',
    });
  });
  
  saveVersion(month, 'Auto-generated');
  
  return bestResult;
}

// Generate report
async function generateReport(month: string, slots: RosterSlot[]): Promise<ScheduleReport> {
  const members = getEligibleMembers();
  const eligibleCount = members.length;
  const allBalance = getAllDutyBalance();

  // 該班型在「當月 roster」的實際格數（與日曆可能不同，以本表為準）
  const slotCounts: Record<SlotCode, number> = {
    WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0,
  };
  slots.forEach(s => { slotCounts[s.slot_code]++; });
  
  // Missing slots
  const missingSlots = slots
    .filter(s => s.assignee_id === null)
    .map(s => ({ date: s.date, slot_code: s.slot_code }));
  
  // Member stats
  const memberStats = members.map(member => {
    const assigned: Record<SlotCode, number> = {
      WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0,
    };
    
    slots.forEach(slot => {
      if (slot.assignee_id === member.id) {
        assigned[slot.slot_code]++;
      }
    });
    
    // 目標 = 該班型當月總格數 ÷ 排班人數（總格數以本表 roster 為準）
    const target: Record<SlotCode, number> = {
      WD_AM: eligibleCount > 0 ? slotCounts.WD_AM / eligibleCount : 0,
      WD_PM: eligibleCount > 0 ? slotCounts.WD_PM / eligibleCount : 0,
      WE_AM: eligibleCount > 0 ? slotCounts.WE_AM / eligibleCount : 0,
      WE_MD: eligibleCount > 0 ? slotCounts.WE_MD / eligibleCount : 0,
      WE_PM: eligibleCount > 0 ? slotCounts.WE_PM / eligibleCount : 0,
    };
    
    // 累計 carry：取最近一筆「已出版」月份的 DutyBalance（即上月累計）
    const prior = allBalance
      .filter(b => b.member_id === member.id && b.month < month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const carry: Record<SlotCode, number> = prior
      ? { WD_AM: prior.carry_WD_AM, WD_PM: prior.carry_WD_PM, WE_AM: prior.carry_WE_AM, WE_MD: prior.carry_WE_MD, WE_PM: prior.carry_WE_PM }
      : { WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0 };
    
    return { member, assigned, target, carry };
  });
  
  // WE_PM balance
  const wePmCounts = memberStats.map(s => ({ member: s.member, count: s.assigned.WE_PM }));
  const sortedWePm = wePmCounts.sort((a, b) => b.count - a.count);
  
  // 下月 Carry 預估：一直累計 = 上月累計（s.carry）+ 本月 (target - assigned)。
  // 若該成員當月對某班型可排數=0（如僅週四可排者排不到假日），該班型 delta=0，與 recalcCarry 一致。
  const slotCodes: SlotCode[] = ['WD_AM', 'WD_PM', 'WE_AM', 'WE_MD', 'WE_PM'];
  const nextMonthCarry: Array<{ member: Member; carry: Record<SlotCode, number>; total: number }> = [];
  for (const s of memberStats) {
    const carry: Record<SlotCode, number> = { WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0 };
    for (const code of slotCodes) {
      const avail = await countAvailableSlotsForType(s.member.id, month, code);
      if (avail === 0) {
        carry[code] = 0;
      } else {
        carry[code] = s.carry[code] + (s.target[code] - s.assigned[code]);
      }
    }
    nextMonthCarry.push({
      member: s.member,
      carry,
      total: Object.values(carry).reduce((a, b) => a + b, 0),
    });
  }
  
  return {
    missing_slots: missingSlots,
    member_stats: memberStats,
    slot_counts: slotCounts,
    eligible_count: eligibleCount,
    we_pm_balance: {
      most: sortedWePm.length > 0 ? sortedWePm[0] : null,
      least: sortedWePm.length > 0 ? sortedWePm[sortedWePm.length - 1] : null,
    },
    next_month_carry: nextMonthCarry,
  };
}

// Regenerate schedule (clear draft first)
export async function regenerateSchedule(month: string): Promise<ScheduleResult> {
  clearMonthDraft(month);
  return generateSchedule(month);
}

// Get current schedule report
export async function getScheduleReport(month: string): Promise<ScheduleReport> {
  const raw = getRosterSlots(month);
  const slots = raw.filter(s => getSlotCodesForDay(s.date).includes(s.slot_code));
  return generateReport(month, slots);
}
