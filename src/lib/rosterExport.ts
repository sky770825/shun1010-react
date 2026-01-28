/**
 * 排班表匯出／匯入 CSV：格式對齊 Google 試算表「次月排班表」
 * 欄位：时间戳记, 年月, 排班类型, 日期, 班别, 成员ID, 成员姓名, 班别时段
 */

import type { RosterSlot, SlotCode } from '@/types';
import type { Member } from '@/types';
import { SLOT_INFO } from './constants';
import { getSlotCodesForDay } from './utils';
import { setRosterSlot, clearMonthDraft, getMonthStatus } from '@/services/dataService';
import { parseISO, format } from 'date-fns';

function getShiftLabel(slotCode: SlotCode): string {
  if (slotCode === 'WE_MD') return '中班';
  if (slotCode === 'WD_AM' || slotCode === 'WE_AM') return '早班';
  return '晚班'; // WD_PM, WE_PM
}

function getShiftSort(slotCode: SlotCode): number {
  if (slotCode === 'WD_AM' || slotCode === 'WE_AM') return 0;
  if (slotCode === 'WE_MD') return 1;
  return 2;
}

function csvEscape(v: string): string {
  if (/[,"\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/** 解析單行 CSV（支援雙引號包覆、欄內逗號與 "" 轉義） */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      out.push(field);
      if (line[i] === ',') i++;
    } else {
      let field = '';
      while (i < line.length && line[i] !== ',') {
        field += line[i];
        i++;
      }
      out.push(field);
      if (line[i] === ',') i++;
    }
  }
  return out;
}

/** 班別中文 → 可對應的 slot 前綴：早→AM, 中/午→MD, 晚→PM */
function shiftLabelToSlotType(label: string): 'AM' | 'MD' | 'PM' | null {
  const t = label.trim();
  if (t === '早班') return 'AM';
  if (t === '中班' || t === '午班') return 'MD';
  if (t === '晚班') return 'PM';
  return null;
}

export interface ImportRosterResult {
  month: string;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * 從 CSV 文字匯入排班表。格式需與匯出一致：
 * 时间戳记, 年月, 排班类型, 日期, 班别, 成员ID, 成员姓名, 班别时段
 * - 年月：YYYY-MM；該月若已鎖定則不匯入。
 * - 日期：1–31。
 * - 班别：早班／中班／午班／晚班。
 * - 成员ID：空或「缺」表示該格不排人。
 * 會先清除該月草稿，再寫入 CSV 資料；全員不排班日（如春節）的列會略過。
 */
export function importRosterFromCsv(csvText: string): ImportRosterResult {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;
  let targetMonth = '';

  const raw = csvText.replace(/^\uFEFF/, '').trim();
  const lines = raw.split(/\r?\n/).filter((s) => s.trim().length > 0);
  if (lines.length < 2) {
    return { month: '', imported: 0, skipped: 0, errors: ['CSV 需包含標題列與至少一筆資料'] };
  }

  const header = parseCsvRow(lines[0]);
  const idxMonth = header.indexOf('年月');
  const idxDay = header.indexOf('日期');
  const idxShift = header.indexOf('班别');
  const idxId = header.indexOf('成员ID');
  if (idxMonth < 0 || idxDay < 0 || idxShift < 0 || idxId < 0) {
    return {
      month: '',
      imported: 0,
      skipped: 0,
      errors: ['CSV 需包含欄位：年月、日期、班别、成员ID'],
    };
  }

  // 第一輪：由第一筆有效資料取得目標月份
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length <= Math.max(idxMonth, idxDay)) continue;
    const ym = String(cols[idxMonth] ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(ym)) {
      targetMonth = ym;
      break;
    }
  }
  if (!targetMonth) {
    return { month: '', imported: 0, skipped: 0, errors: ['無法從 CSV 取得有效年月 (YYYY-MM)'] };
  }
  if (getMonthStatus(targetMonth) === 'locked') {
    return {
      month: targetMonth,
      imported: 0,
      skipped: 0,
      errors: ['該月份已鎖定，請先解鎖後再匯入'],
    };
  }

  clearMonthDraft(targetMonth);

  // 第二輪：只處理目標月份的列，寫入 setRosterSlot
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    if (cols.length <= Math.max(idxMonth, idxDay, idxShift, idxId)) {
      skipped++;
      continue;
    }
    const yearMonth = String(cols[idxMonth] ?? '').trim();
    const dayStr = String(cols[idxDay] ?? '').trim();
    const shiftLabel = String(cols[idxShift] ?? '').trim();
    const memberIdRaw = String(cols[idxId] ?? '').trim();

    if (yearMonth !== targetMonth) {
      skipped++;
      continue;
    }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      skipped++;
      continue;
    }
    const day = parseInt(dayStr, 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      skipped++;
      continue;
    }
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`;
    let d: Date;
    try {
      d = parseISO(date);
    } catch {
      skipped++;
      continue;
    }
    if (!format(d, 'yyyy-MM-dd').startsWith(yearMonth)) {
      skipped++;
      continue;
    }

    const slotType = shiftLabelToSlotType(shiftLabel);
    const daySlots = getSlotCodesForDay(date);
    if (daySlots.length === 0) {
      skipped++;
      continue;
    }
    let slotCode: SlotCode | null = null;
    if (slotType === 'AM') {
      slotCode = (daySlots.find((c) => c === 'WD_AM' || c === 'WE_AM') ?? null) as SlotCode | null;
    } else if (slotType === 'MD') {
      slotCode = daySlots.includes('WE_MD') ? 'WE_MD' : null;
    } else if (slotType === 'PM') {
      slotCode = (daySlots.find((c) => c === 'WD_PM' || c === 'WE_PM') ?? null) as SlotCode | null;
    }
    if (!slotCode) {
      skipped++;
      continue;
    }

    const assigneeId =
      !memberIdRaw || memberIdRaw === '缺' || memberIdRaw === '—' || memberIdRaw === '-'
        ? null
        : memberIdRaw;

    setRosterSlot(date, slotCode, assigneeId, { status: 'draft' });
    imported++;
  }

  return { month: targetMonth, imported, skipped, errors };
}

/**
 * 匯出指定月份的排班表為 CSV，欄位順序與「次月排班表」一致。
 * @param month 年月 YYYY-MM（如 2026-01）
 * @param slots 該月排班格（getRosterSlots(month)）
 * @param members 成員列表（getMembers()）
 */
export function exportRosterToCsv(
  month: string,
  slots: RosterSlot[],
  members: Member[]
): void {
  const timestamp = new Date().toISOString();
  const scheduleType = '隨機平均排班';
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const rows = slots
    .slice()
    .sort((a, b) => {
      const dayA = parseInt(a.date.slice(8, 10), 10);
      const dayB = parseInt(b.date.slice(8, 10), 10);
      if (dayA !== dayB) return dayA - dayB;
      return getShiftSort(a.slot_code) - getShiftSort(b.slot_code);
    })
    .map((s) => {
      const day = parseInt(s.date.slice(8, 10), 10);
      const shiftLabel = getShiftLabel(s.slot_code);
      const memberId = s.assignee_id || '';
      const memberName = s.assignee_id ? (memberMap.get(s.assignee_id)?.name ?? '?') : '缺';
      const timeRange = SLOT_INFO[s.slot_code].time;

      return [timestamp, month, scheduleType, day, shiftLabel, memberId, memberName, timeRange];
    });

  const header = ['时间戳记', '年月', '排班类型', '日期', '班别', '成员ID', '成员姓名', '班别时段'];
  const csvLines = [
    header.map(csvEscape).join(','),
    ...rows.map((row) => row.map((c) => csvEscape(String(c))).join(',')),
  ];
  const csv = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `排班表_${month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
