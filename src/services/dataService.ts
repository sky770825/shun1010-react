/**
 * Data Service Abstraction Layer
 * Currently implements localStorage, but can be swapped to Supabase/Google Sheets
 */

import type {
  Member,
  RosterSlot,
  AvailabilityRule,
  DutyBalance,
  FairnessSettings,
  KeyItem,
  Lending,
  LendingItem,
  AppVersion,
  SlotCode,
  RosterStatus,
} from '@/types';
import { STORAGE_KEYS, DEFAULT_FAIRNESS_SETTINGS, DEFAULT_LEGACY_MEMBERS, DEFAULT_SAME_DAY_PAIRS, DEFAULT_AVAILABILITY_RULES, WEEKDAY_NAMES_FULL, PROJECT_NAMING } from '@/lib/constants';
import { generateId, safeJsonParse, formatMonth, getDaysInMonth, getSlotCodesForDay, isWeekendDay } from '@/lib/utils';
import { USE_SUPABASE } from '@/lib/supabase';
import * as supabaseService from './supabaseDataService';

// ========================
// Storage Helpers
// ========================

/** 一次性：從舊 key（duty_*）遷移到 app/shun1010/* */
function migrateFromLegacyStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const prefix = PROJECT_NAMING.storage_prefix;
  for (const newKey of Object.values(STORAGE_KEYS)) {
    const oldKey = newKey.slice(prefix.length);
    const oldVal = localStorage.getItem(oldKey);
    const newVal = localStorage.getItem(newKey);
    if (oldVal != null && newVal == null) {
      localStorage.setItem(newKey, oldVal);
      localStorage.removeItem(oldKey);
    }
  }
}
migrateFromLegacyStorage();

function getStorage<T>(key: string, fallback: T): T {
  return safeJsonParse(localStorage.getItem(key), fallback);
}

function setStorage<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ========================
// Members
// ========================

export function getMembers(): Member[] {
  return getStorage<Member[]>(STORAGE_KEYS.MEMBERS, []);
}

export async function getMembersAsync(): Promise<Member[]> {
  if (USE_SUPABASE) {
    return await supabaseService.getMembers();
  }
  return Promise.resolve(getStorage<Member[]>(STORAGE_KEYS.MEMBERS, []));
}

export function upsertMember(member: Partial<Member> & { name: string }): Member {
  const members = getMembers();
  const now = new Date().toISOString();

  if (member.id) {
    const index = members.findIndex(m => m.id === member.id);
    if (index >= 0) {
      members[index] = { ...members[index], ...member, updated_at: now };
      setStorage(STORAGE_KEYS.MEMBERS, members);
  // 同步到 Supabase
  if (USE_SUPABASE) {
    void supabaseService.upsertMember(members[index]).catch(err => {
      console.error('同步成員到 Supabase 失敗:', err);
    });
  }
      return members[index];
    }
  }
  const newMember: Member = {
    id: member.id || generateId('M'),
    name: member.name,
    is_active: member.is_active ?? true,
    exclude_roster: member.exclude_roster ?? false,
    role: member.role ?? 'member',
    max_shifts_per_day: member.max_shifts_per_day ?? 1,
    note: member.note,
    created_at: now,
    updated_at: now,
  };
  members.push(newMember);
  setStorage(STORAGE_KEYS.MEMBERS, members);
  // 同步到 Supabase
  if (USE_SUPABASE) {
    void supabaseService.upsertMember(newMember).catch(err => {
      console.error('同步成員到 Supabase 失敗:', err);
    });
  }
  return newMember;
}

export async function upsertMemberAsync(member: Partial<Member> & { name: string }): Promise<Member> {
  if (USE_SUPABASE) {
    return await supabaseService.upsertMember(member);
  }
  return Promise.resolve(upsertMember(member));
}

export function setMemberActive(memberId: string, isActive: boolean): void {
  const members = getMembers();
  const index = members.findIndex(m => m.id === memberId);
  if (index >= 0) {
    members[index].is_active = isActive;
    members[index].updated_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.MEMBERS, members);
  }
}

export function setExcludeRoster(memberId: string, exclude: boolean): void {
  const members = getMembers();
  const index = members.findIndex(m => m.id === memberId);
  if (index >= 0) {
    members[index].exclude_roster = exclude;
    members[index].updated_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.MEMBERS, members);
  }
}

export function deleteMember(memberId: string): void {
  const members = getMembers().filter(m => m.id !== memberId);
  setStorage(STORAGE_KEYS.MEMBERS, members);
}

// ========================
// Availability Rules
// ========================

export function getRules(): AvailabilityRule[] {
  return getStorage<AvailabilityRule[]>(STORAGE_KEYS.RULES, []);
}

export function getRulesByMember(memberId: string): AvailabilityRule[] {
  return getRules().filter(r => r.member_id === memberId);
}

export function upsertRule(rule: Partial<AvailabilityRule> & { member_id: string; rule_type: AvailabilityRule['rule_type'] }): AvailabilityRule {
  const rules = getRules();
  const now = new Date().toISOString();

  if (rule.rule_id) {
    const index = rules.findIndex(r => r.rule_id === rule.rule_id);
    if (index >= 0) {
      rules[index] = { ...rules[index], ...rule, updated_at: now };
      setStorage(STORAGE_KEYS.RULES, rules);
      return rules[index];
    }
  }
  const newRule: AvailabilityRule = {
    rule_id: rule.rule_id || generateId('R'),
    member_id: rule.member_id,
    rule_type: rule.rule_type,
    action: rule.action ?? 'blocked',
    weekday: rule.weekday,
    date: rule.date,
    start_date: rule.start_date,
    end_date: rule.end_date,
    slot_code: rule.slot_code ?? 'any',
    reason: rule.reason ?? '',
    priority: rule.priority ?? 100,
    is_active: rule.is_active ?? true,
    created_at: now,
    updated_at: now,
  };
  rules.push(newRule);
  setStorage(STORAGE_KEYS.RULES, rules);
  // 同步到 Supabase
  if (USE_SUPABASE) {
    void supabaseService.upsertRule(rule).catch(err => {
      console.error('同步規則到 Supabase 失敗:', err);
    });
  }
  return newRule;
}

export function deleteRule(ruleId: string): void {
  const rules = getRules().filter(r => r.rule_id !== ruleId);
  setStorage(STORAGE_KEYS.RULES, rules);
}

export function deleteRules(ruleIds: string[]): void {
  if (ruleIds.length === 0) return;
  const ids = new Set(ruleIds);
  const rules = getRules().filter(r => !ids.has(r.rule_id));
  setStorage(STORAGE_KEYS.RULES, rules);
}

export function toggleRuleActive(ruleId: string, isActive: boolean): void {
  const rules = getRules();
  const index = rules.findIndex(r => r.rule_id === ruleId);
  if (index >= 0) {
    rules[index].is_active = isActive;
    rules[index].updated_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.RULES, rules);
  }
}

// Check if weekly rule already exists
export function findWeeklyRule(memberId: string, weekday: number, slotCode: SlotCode | 'any'): AvailabilityRule | undefined {
  return getRules().find(
    r => r.member_id === memberId &&
      r.rule_type === 'weekly' &&
      r.weekday === weekday &&
      r.slot_code === slotCode
  );
}

// ========================
// Roster Slots
// ========================

export function getRosterSlots(month: string): RosterSlot[] {
  const allSlots = getStorage<RosterSlot[]>(STORAGE_KEYS.ROSTER_SLOTS, []);
  return allSlots.filter(s => s.date.startsWith(month));
}

export function getAllRosterSlots(): RosterSlot[] {
  return getStorage<RosterSlot[]>(STORAGE_KEYS.ROSTER_SLOTS, []);
}

export function setRosterSlot(
  date: string,
  slotCode: SlotCode,
  assigneeId: string | null,
  options?: { is_substitute?: boolean; original_assignee_id?: string | null; status?: RosterStatus }
): RosterSlot {
  const allSlots = getAllRosterSlots();
  const now = new Date().toISOString();

  const index = allSlots.findIndex(s => s.date === date && s.slot_code === slotCode);

  const slot: RosterSlot = {
    date,
    slot_code: slotCode,
    assignee_id: assigneeId,
    is_substitute: options?.is_substitute ?? false,
    original_assignee_id: options?.original_assignee_id ?? null,
    status: options?.status ?? 'draft',
    updated_at: now,
  };

  if (index >= 0) {
    allSlots[index] = { ...allSlots[index], ...slot };
  } else {
    allSlots.push(slot);
  }

  setStorage(STORAGE_KEYS.ROSTER_SLOTS, allSlots);
  // 同步到 Supabase
  if (USE_SUPABASE) {
    void supabaseService.setRosterSlot(date, slotCode, assigneeId, options).catch(err => {
      console.error('同步班表到 Supabase 失敗:', err);
    });
  }
  return slot;
}

export function clearMonthDraft(month: string): void {
  const allSlots = getAllRosterSlots();
  const filtered = allSlots.filter(s => !(s.date.startsWith(month) && s.status === 'draft'));
  setStorage(STORAGE_KEYS.ROSTER_SLOTS, filtered);
  // 同步到 Supabase
  if (USE_SUPABASE) {
    void supabaseService.clearMonthDraft(month).catch(err => {
      console.error('同步清除草稿到 Supabase 失敗:', err);
    });
  }
}

export function getMonthStatus(month: string): RosterStatus {
  const slots = getRosterSlots(month);
  if (slots.length === 0) return 'draft';
  if (slots.some(s => s.status === 'locked')) return 'locked';
  if (slots.every(s => s.status === 'published')) return 'published';
  return 'draft';
}

export function publishMonth(month: string): void {
  const allSlots = getAllRosterSlots();
  allSlots.forEach(s => {
    if (s.date.startsWith(month)) {
      s.status = 'published';
      s.updated_at = new Date().toISOString();
    }
  });
  setStorage(STORAGE_KEYS.ROSTER_SLOTS, allSlots);

  // Save version snapshot
  saveVersion(month, 'Published');

  // Recalculate carry
  recalcCarry(month);
}

export function lockMonth(month: string): void {
  const allSlots = getAllRosterSlots();
  allSlots.forEach(s => {
    if (s.date.startsWith(month)) {
      s.status = 'locked';
      s.updated_at = new Date().toISOString();
    }
  });
  setStorage(STORAGE_KEYS.ROSTER_SLOTS, allSlots);
}

export function unlockMonth(month: string): void {
  const allSlots = getAllRosterSlots();
  allSlots.forEach(s => {
    if (s.date.startsWith(month) && s.status === 'locked') {
      s.status = 'published';
      s.updated_at = new Date().toISOString();
    }
  });
  setStorage(STORAGE_KEYS.ROSTER_SLOTS, allSlots);
}

// ========================
// Duty Balance
// ========================

export function getDutyBalance(month: string): DutyBalance[] {
  const all = getStorage<DutyBalance[]>(STORAGE_KEYS.DUTY_BALANCE, []);
  return all.filter(b => b.month === month);
}

export function getAllDutyBalance(): DutyBalance[] {
  return getStorage<DutyBalance[]>(STORAGE_KEYS.DUTY_BALANCE, []);
}

export function upsertDutyBalance(balance: DutyBalance): void {
  const all = getAllDutyBalance();
  const index = all.findIndex(b => b.month === balance.month && b.member_id === balance.member_id);

  if (index >= 0) {
    all[index] = balance;
  } else {
    all.push(balance);
  }

  setStorage(STORAGE_KEYS.DUTY_BALANCE, all);
}

export function recalcCarry(month: string): void {
  const raw = getRosterSlots(month);
  const slots = raw.filter(s => getSlotCodesForDay(s.date).includes(s.slot_code));
  const members = getMembers().filter(m => m.is_active && !m.exclude_roster);
  const allBalance = getAllDutyBalance();
  const now = new Date().toISOString();

  // 該班型在當月 roster 的格數，用於 target（排除全員不排班日）
  const slotCounts: Record<SlotCode, number> = {
    WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0,
  };
  slots.forEach(s => { slotCounts[s.slot_code]++; });
  const n = members.length;
  const target: Record<SlotCode, number> = {
    WD_AM: n > 0 ? slotCounts.WD_AM / n : 0,
    WD_PM: n > 0 ? slotCounts.WD_PM / n : 0,
    WE_AM: n > 0 ? slotCounts.WE_AM / n : 0,
    WE_MD: n > 0 ? slotCounts.WE_MD / n : 0,
    WE_PM: n > 0 ? slotCounts.WE_PM / n : 0,
  };

  for (const member of members) {
    const assigned: Record<SlotCode, number> = {
      WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0,
    };
    slots.forEach(slot => {
      if (slot.assignee_id === member.id) assigned[slot.slot_code]++;
    });

    // 累計 carry：取「最近一筆」已出版月份的 DutyBalance 的 carry，加上本月的 (target - assigned)。
    // 若該成員當月對某班型「可排格數 = 0」（如僅週四可排者永遠排不到假日），該班型不計入 delta，否則會永遠累積欠。
    const prior = allBalance
      .filter(b => b.member_id === member.id && b.month < month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const prevCarry: Record<SlotCode, number> = prior
      ? { WD_AM: prior.carry_WD_AM, WD_PM: prior.carry_WD_PM, WE_AM: prior.carry_WE_AM, WE_MD: prior.carry_WE_MD, WE_PM: prior.carry_WE_PM }
      : { WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0 };

    const slotCodes: SlotCode[] = ['WD_AM', 'WD_PM', 'WE_AM', 'WE_MD', 'WE_PM'];
    const carry: Record<SlotCode, number> = { WD_AM: 0, WD_PM: 0, WE_AM: 0, WE_MD: 0, WE_PM: 0 };
      for (const code of slotCodes) {
        const avail = countAvailableSlotsForType(member.id, month, code);
        if (avail === 0) {
        carry[code] = 0;
      } else {
        carry[code] = prevCarry[code] + (target[code] - assigned[code]);
      }
    }

    const balance: DutyBalance = {
      month,
      member_id: member.id,
      assigned_WD_AM: assigned.WD_AM,
      assigned_WD_PM: assigned.WD_PM,
      assigned_WE_AM: assigned.WE_AM,
      assigned_WE_MD: assigned.WE_MD,
      assigned_WE_PM: assigned.WE_PM,
      carry_WD_AM: carry.WD_AM,
      carry_WD_PM: carry.WD_PM,
      carry_WE_AM: carry.WE_AM,
      carry_WE_MD: carry.WE_MD,
      carry_WE_PM: carry.WE_PM,
      assigned_total: Object.values(assigned).reduce((a, b) => a + b, 0),
      carry_total: Object.values(carry).reduce((a, b) => a + b, 0),
      updated_at: now,
    };
    upsertDutyBalance(balance);
  }
}

// ========================
// Fairness Settings
// ========================

export function getFairnessSettings(): FairnessSettings {
  return getStorage<FairnessSettings>(STORAGE_KEYS.FAIRNESS_SETTINGS, DEFAULT_FAIRNESS_SETTINGS);
}

export function updateFairnessSettings(settings: Partial<FairnessSettings>): FairnessSettings {
  const current = getFairnessSettings();
  const updated = { ...current, ...settings };
  setStorage(STORAGE_KEYS.FAIRNESS_SETTINGS, updated);
  return updated;
}

// ========================
// Same-Day Pairs（同天搭檔：此兩人須排同一天）
// ========================

export function getSameDayPairs(): [string, string][] {
  return getStorage<[string, string][]>(STORAGE_KEYS.SAME_DAY_PAIRS, DEFAULT_SAME_DAY_PAIRS);
}

export function setSameDayPairs(pairs: [string, string][]): void {
  setStorage(STORAGE_KEYS.SAME_DAY_PAIRS, pairs);
}

/**
 * 套用常順預設「每週不可排」規則（DEFAULT_AVAILABILITY_RULES）。
 * 若該成員在該 weekday 已有任一 weekly 規則則跳過，不覆蓋既有設定。
 * @returns 本次新增的規則筆數
 */
export function applyDefaultAvailabilityRules(): number {
  const rules = getRules();
  let added = 0;
  for (const { member_id, weekday } of DEFAULT_AVAILABILITY_RULES) {
    const has = rules.some(r => r.member_id === member_id && r.rule_type === 'weekly' && r.weekday === weekday);
    if (has) continue;
    upsertRule({
      member_id,
      rule_type: 'weekly',
      action: 'blocked',
      weekday,
      slot_code: 'any',
      reason: `每${WEEKDAY_NAMES_FULL[weekday]}不可排`,
    });
    added++;
  }
  return added;
}

// ========================
// App Versions
// ========================

export function getVersions(): AppVersion[] {
  return getStorage<AppVersion[]>(STORAGE_KEYS.APP_VERSIONS, []);
}

export function getVersionsByMonth(month: string): AppVersion[] {
  return getVersions().filter(v => v.month === month).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function saveVersion(month: string, note?: string): AppVersion {
  const versions = getVersions();
  const slots = getRosterSlots(month);

  const version: AppVersion = {
    version_id: generateId('V'),
    created_at: new Date().toISOString(),
    month,
    roster_snapshot: slots,
    note,
  };

  versions.push(version);

  // Keep only last 10 versions per month
  const monthVersions = versions.filter(v => v.month === month);
  if (monthVersions.length > 10) {
    const oldest = monthVersions.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    const filtered = versions.filter(v => v.version_id !== oldest.version_id);
    setStorage(STORAGE_KEYS.APP_VERSIONS, filtered);
  } else {
    setStorage(STORAGE_KEYS.APP_VERSIONS, versions);
  }

  return version;
}

export function rollbackVersion(versionId: string): void {
  const version = getVersions().find(v => v.version_id === versionId);
  if (!version) return;

  // Clear current month slots
  const allSlots = getAllRosterSlots().filter(s => !s.date.startsWith(version.month));

  // Restore snapshot
  const restored = [...allSlots, ...version.roster_snapshot];
  setStorage(STORAGE_KEYS.ROSTER_SLOTS, restored);
}

// ========================
// Keys
// ========================

export function getKeys(): KeyItem[] {
  return getStorage<KeyItem[]>(STORAGE_KEYS.KEYS, []);
}

export function upsertKey(key: Partial<KeyItem> & { key_name: string }): KeyItem {
  const keys = getKeys();
  const now = new Date().toISOString();

  if (key.key_id) {
    const index = keys.findIndex(k => k.key_id === key.key_id);
    if (index >= 0) {
      keys[index] = { ...keys[index], ...key, updated_at: now };
      setStorage(STORAGE_KEYS.KEYS, keys);
      return keys[index];
    }
  }

  const newKey: KeyItem = {
    key_id: key.key_id || generateId('K'),
    key_name: key.key_name,
    address: key.address,
    is_active: key.is_active ?? true,
    note: key.note,
    created_at: now,
    updated_at: now,
  };

  keys.push(newKey);
  setStorage(STORAGE_KEYS.KEYS, keys);
  return newKey;
}

export function toggleKeyActive(keyId: string, isActive: boolean): void {
  const keys = getKeys();
  const index = keys.findIndex(k => k.key_id === keyId);
  if (index >= 0) {
    keys[index].is_active = isActive;
    keys[index].updated_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.KEYS, keys);
  }
}

export function deleteKey(keyId: string): void {
  const keys = getKeys().filter(k => k.key_id !== keyId);
  setStorage(STORAGE_KEYS.KEYS, keys);
}

// ========================
// Lendings
// ========================

export function getLendings(): Lending[] {
  return getStorage<Lending[]>(STORAGE_KEYS.LENDINGS, []);
}

export function getLendingItems(): LendingItem[] {
  return getStorage<LendingItem[]>(STORAGE_KEYS.LENDING_ITEMS, []);
}

export function getLendingWithItems(lendingId: string): { lending: Lending; items: LendingItem[] } | null {
  const lending = getLendings().find(l => l.lending_id === lendingId);
  if (!lending) return null;
  const items = getLendingItems().filter(i => i.lending_id === lendingId);
  return { lending, items };
}

export function createLending(
  lending: Omit<Lending, 'lending_id' | 'created_at' | 'status'>,
  items: Array<{ key_id?: string; key_name: string; qty?: number }>
): { lending: Lending; items: LendingItem[] } {
  const lendings = getLendings();
  const lendingItems = getLendingItems();
  const now = new Date().toISOString();

  const newLending: Lending = {
    lending_id: generateId('L'),
    created_at: now,
    status: 'out',
    ...lending,
  };

  const newItems: LendingItem[] = items.map(item => ({
    id: generateId('LI'),
    lending_id: newLending.lending_id,
    key_id: item.key_id,
    key_name: item.key_name,
    qty: item.qty ?? 1,
  }));

  lendings.push(newLending);
  lendingItems.push(...newItems);

  setStorage(STORAGE_KEYS.LENDINGS, lendings);
  setStorage(STORAGE_KEYS.LENDING_ITEMS, lendingItems);

  for (const i of newItems) addKeyItemToHistory(i.key_name);

  return { lending: newLending, items: newItems };
}

export function markReturned(lendingId: string): void {
  const lendings = getLendings();
  const index = lendings.findIndex(l => l.lending_id === lendingId);
  if (index >= 0) {
    lendings[index].status = 'returned';
    lendings[index].returned_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.LENDINGS, lendings);
  }
}

export function confirmDuty(lendingId: string, confirmerMemberId: string): void {
  const lendings = getLendings();
  const index = lendings.findIndex(l => l.lending_id === lendingId);
  if (index >= 0) {
    lendings[index].duty_confirmed_by = confirmerMemberId;
    lendings[index].duty_confirmed_at = new Date().toISOString();
    setStorage(STORAGE_KEYS.LENDINGS, lendings);
  }
}

export function listLendings(filters?: {
  status?: Lending['status'] | 'all';
  borrower_type?: Lending['borrower_type'] | 'all';
  search?: string;
  /** 只列出該日建立的借出（YYYY-MM-DD） */
  date?: string;
}): Array<{ lending: Lending; items: LendingItem[] }> {
  let lendings = getLendings();
  const allItems = getLendingItems();
  
  if (filters?.date) {
    lendings = lendings.filter(l => l.created_at.startsWith(filters!.date!));
  }
  
  if (filters?.status && filters.status !== 'all') {
    lendings = lendings.filter(l => l.status === filters.status);
  }
  
  if (filters?.borrower_type && filters.borrower_type !== 'all') {
    lendings = lendings.filter(l => l.borrower_type === filters.borrower_type);
  }
  
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    lendings = lendings.filter(l => 
      l.borrower_name.toLowerCase().includes(search) ||
      l.partner_company?.toLowerCase().includes(search) ||
      allItems.some(i => i.lending_id === l.lending_id && i.key_name.toLowerCase().includes(search))
    );
  }
  
  return lendings
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(lending => ({
      lending,
      items: allItems.filter(i => i.lending_id === lending.lending_id),
    }));
}

// ========================
// Temp Duty Override（臨時代班）
// ========================
// 格式：{ "YYYY-MM-DD": { "WD_AM": "memberId", ... } }

export function getTempDuty(date: string): Partial<Record<SlotCode, string>> {
  const data = getStorage<Record<string, Record<string, string>>>(STORAGE_KEYS.TEMP_DUTY, {});
  const day = data[date];
  if (!day) return {};
  return day as Partial<Record<SlotCode, string>>;
}

export function setTempDuty(date: string, overrides: Partial<Record<SlotCode, string>>): void {
  const data = getStorage<Record<string, Record<string, string>>>(STORAGE_KEYS.TEMP_DUTY, {});
  if (!data[date]) data[date] = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (v) data[date][k] = v;
    else delete data[date][k];
  }
  if (Object.keys(data[date]).length === 0) delete data[date];
  setStorage(STORAGE_KEYS.TEMP_DUTY, data);
}

export function clearTempDuty(date: string): void {
  const data = getStorage<Record<string, Record<string, string>>>(STORAGE_KEYS.TEMP_DUTY, {});
  delete data[date];
  setStorage(STORAGE_KEYS.TEMP_DUTY, data);
}

// ========================
// Key Item History（常用鑰匙）
// ========================

export function getKeyItemHistory(): string[] {
  return getStorage<string[]>(STORAGE_KEYS.KEY_ITEM_HISTORY, []);
}

export function addKeyItemToHistory(keyName: string): void {
  if (!keyName?.trim()) return;
  let arr = getKeyItemHistory().filter(s => s.toLowerCase() !== keyName.trim().toLowerCase());
  arr.unshift(keyName.trim());
  if (arr.length > 15) arr = arr.slice(0, 15);
  setStorage(STORAGE_KEYS.KEY_ITEM_HISTORY, arr);
}

export function clearKeyItemHistory(): void {
  setStorage(STORAGE_KEYS.KEY_ITEM_HISTORY, []);
}

// ========================
// Availability Check
// ========================

export function isAvailable(memberId: string, date: string, slotCode: SlotCode): { available: boolean; reason?: string } {
  const rules = getRules().filter(r => r.member_id === memberId && r.is_active);
  const dateObj = new Date(date);
  const weekday = dateObj.getDay();
  
  let blockedReason: string | undefined;
  let allowedPriority = -1;
  let blockedPriority = -1;
  
  for (const rule of rules) {
    const matchesSlot = rule.slot_code === 'any' || rule.slot_code === slotCode;
    if (!matchesSlot) continue;
    
    let matches = false;
    
    switch (rule.rule_type) {
      case 'weekly':
        matches = rule.weekday === weekday;
        break;
      case 'date':
        matches = rule.date === date;
        break;
      case 'range':
        if (rule.start_date && rule.end_date) {
          matches = date >= rule.start_date && date <= rule.end_date;
        }
        break;
    }
    
    if (matches) {
      if (rule.action === 'blocked' && rule.priority > blockedPriority) {
        blockedPriority = rule.priority;
        blockedReason = rule.reason || '不可排班';
      } else if (rule.action === 'allowed' && rule.priority > allowedPriority) {
        allowedPriority = rule.priority;
      }
    }
  }
  
  // If both blocked and allowed match, use priority
  if (blockedPriority > allowedPriority) {
    return { available: false, reason: blockedReason };
  }
  
  return { available: true };
}

/** 依目前規則，估算成員在指定月份「可排」的班次數（可被自動排班選入的 slot 數）。僅供參考。 */
export function estimateAvailableSlots(memberId: string, month: string): number {
  const days = getDaysInMonth(month);
  let count = 0;
  for (const date of days) {
    for (const slotCode of getSlotCodesForDay(date)) {
      if (isAvailable(memberId, date, slotCode).available) count++;
    }
  }
  return count;
}

/**
 * 當月該成員在「該班型」可排的格數。
 * 若為 0，recalcCarry / 下月 carry 預估 不應把該班型的 (target - assigned) 計入，
 * 否則如「僅週四可排」者永遠排不到假日班，卻每個月 (target_WE - 0) 一直累積欠，不合理。
 */
export function countAvailableSlotsForType(memberId: string, month: string, slotCode: SlotCode): number {
  const days = getDaysInMonth(month);
  let n = 0;
  for (const d of days) {
    if (getSlotCodesForDay(d).includes(slotCode) && isAvailable(memberId, d, slotCode).available) n++;
  }
  return n;
}

// ========================
// Initialize Demo Data
// ========================

/** 2026 年 2 月班表（早 am、午 md、晚 pm；號碼為成員 id，如 '07'） */
const FEB_2026_ROSTER: { d: number; am?: string; md?: string; pm?: string }[] = [
  { d: 1, am: '07', md: '25', pm: '19' },
  { d: 2, am: '03', pm: '05' },
  { d: 3, am: '13', pm: '12' },
  { d: 4, am: '10', pm: '09' },
  { d: 5, am: '01', pm: '06' },
  { d: 6, am: '19', pm: '25' },
  { d: 7, am: '20', md: '09', pm: '10' },
  { d: 8, am: '11', md: '13', pm: '12' },
  { d: 9, am: '17', pm: '16' },
  { d: 10, am: '15', pm: '21' },
  { d: 11, am: '11', pm: '26' },
  { d: 12, am: '18', pm: '01' },
  { d: 13, am: '16', pm: '20' },
  { d: 14, am: '05', md: '15', pm: '03' },
  { d: 15, am: '26', md: '21', pm: '17' },
  { d: 16, am: '07', pm: '03' },
  { d: 17, am: '09', pm: '10' },
  { d: 18, am: '25', pm: '19' },
  { d: 19, am: '06', pm: '07' },
  { d: 20, am: '05', pm: '15' },
  { d: 21, am: '16', md: '06', pm: '18' },
  { d: 22, am: '17', md: '12', pm: '13' },
  { d: 23, am: '20', pm: '11' },
  { d: 24, am: '12', pm: '13' },
  { d: 25, am: '26', pm: '17' },
  { d: 26, am: '01', pm: '18' },
  { d: 27, am: '21', pm: '25' },
  { d: 28, am: '06', md: '10', pm: '09' },
];

/**
 * 若 2026 年 2 月尚無排班，則匯入 FEB_2026_ROSTER 到 sheet（localStorage）。
 * 早 → WD_AM/WE_AM，午 → WE_MD（僅假日），晚 → WD_PM/WE_PM。
 */
export function seedFebruary2026Roster(): void {
  if (getRosterSlots('2026-02').length > 0) return;
  const MONTH = '2026-02';
  for (const row of FEB_2026_ROSTER) {
    const date = `${MONTH}-${String(row.d).padStart(2, '0')}`;
    const isWeekend = isWeekendDay(date);
    const set = (slot: 'am' | 'md' | 'pm', code: SlotCode) => {
      const id = slot === 'am' ? row.am : slot === 'md' ? row.md : row.pm;
      if (id) setRosterSlot(date, code, id, { status: 'draft' });
    };
    if (isWeekend) {
      set('am', 'WE_AM');
      set('md', 'WE_MD');
      set('pm', 'WE_PM');
    } else {
      set('am', 'WD_AM');
      set('pm', 'WD_PM');
    }
  }
}

export async function initializeDemoData(): Promise<void> {
  // 如果使用 Supabase，先從 Supabase 載入所有資料到 localStorage
  if (USE_SUPABASE) {
    try {
      console.log('開始從 Supabase 載入資料...');
      // 載入成員
      const supabaseMembers = await supabaseService.getMembers();
      if (supabaseMembers.length > 0) {
        setStorage(STORAGE_KEYS.MEMBERS, supabaseMembers);
        console.log(`已載入 ${supabaseMembers.length} 位成員`);
      }
      
      // 載入規則
      const supabaseRules = await supabaseService.getRules();
      if (supabaseRules.length > 0) {
        setStorage(STORAGE_KEYS.RULES, supabaseRules);
        console.log(`已載入 ${supabaseRules.length} 筆規則`);
      }
      
      // 載入班表
      const supabaseSlots = await supabaseService.getAllRosterSlots();
      if (supabaseSlots.length > 0) {
        setStorage(STORAGE_KEYS.ROSTER_SLOTS, supabaseSlots);
        console.log(`已載入 ${supabaseSlots.length} 筆班表資料`);
      }
      
      console.log('Supabase 資料載入完成');
    } catch (error) {
      console.error('從 Supabase 載入資料失敗，將使用 localStorage:', error);
      // 連線失敗時不影響應用，繼續使用 localStorage
    }
  }
  
  // 成員：若尚無資料，匯入常順舊班表的人員名單
  const members = getMembers();
  if (members.length === 0) {
    for (const m of DEFAULT_LEGACY_MEMBERS) {
      const member = upsertMember({
        id: m.id,
        name: m.name,
        exclude_roster: m.exclude_roster ?? false,
        role: 'member',
      });
      // 如果使用 Supabase，確保寫入
      if (USE_SUPABASE) {
        try {
          await supabaseService.upsertMember(member);
        } catch (err) {
          console.error(`同步成員 ${member.name} 到 Supabase 失敗:`, err);
        }
      }
    }
  }

  // 2026 年 2 月班表：若尚無資料則匯入
  seedFebruary2026Roster();
  
  // 鑰匙：若已有資料則跳過，否則建立 demo 鑰匙
  if (getKeys().length > 0) return;
  
  // Create demo keys
  const demoKeys = [
    { key_name: 'A101', address: '台北市信義區信義路100號' },
    { key_name: 'A102', address: '台北市信義區信義路102號' },
    { key_name: 'B201', address: '台北市大安區復興南路200號' },
    { key_name: 'B202', address: '台北市大安區復興南路202號' },
    { key_name: 'C301', address: '新北市板橋區文化路300號' },
  ];
  
  for (const k of demoKeys) {
    const key = upsertKey(k);
    // 如果使用 Supabase，確保寫入
    if (USE_SUPABASE) {
      try {
        await supabaseService.upsertKey(key);
      } catch (err) {
        console.error(`同步鑰匙 ${key.key_name} 到 Supabase 失敗:`, err);
      }
    }
  }
}
