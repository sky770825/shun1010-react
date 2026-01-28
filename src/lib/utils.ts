import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isWeekend, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays, subDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { SlotCode, DayType, ShiftTemplate } from "@/types";
import { SHIFT_TEMPLATES, SPECIAL_NO_SCHEDULE_RANGES } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate unique ID
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

// Date utilities
export function formatDate(date: string | Date, formatStr: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr, { locale: zhTW });
}

export function formatMonth(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM');
}

export function formatDisplayDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'M/d (EEE)', { locale: zhTW });
}

export function isWeekendDay(date: string | Date): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isWeekend(d);
}

export function getDayType(date: string | Date): DayType {
  return isWeekendDay(date) ? 'weekend' : 'weekday';
}

/** 是否為「全員不排班」日（如特殊春節），該日不產生任何班格。 */
export function isNoScheduleDate(date: string): boolean {
  return SPECIAL_NO_SCHEDULE_RANGES.some(
    (r) => date >= r.start_date && date <= r.end_date
  );
}

/** 若該日為全員不排班日，回傳其標籤（如「特殊春節」），否則 null。 */
export function getNoScheduleLabel(date: string): string | null {
  const r = SPECIAL_NO_SCHEDULE_RANGES.find(
    (r) => date >= r.start_date && date <= r.end_date
  );
  return r ? r.label : null;
}

export function getSlotsForDay(date: string | Date): ShiftTemplate[] {
  const dateStr = typeof date === "string" ? date : format(date, "yyyy-MM-dd");
  if (isNoScheduleDate(dateStr)) return [];
  const dayType = getDayType(date);
  return SHIFT_TEMPLATES.filter(t => t.day_type === dayType).sort((a, b) => a.sort_order - b.sort_order);
}

export function getSlotCodesForDay(date: string | Date): SlotCode[] {
  return getSlotsForDay(date).map(t => t.slot_code);
}

export function getDaysInMonth(month: string): string[] {
  const start = startOfMonth(parseISO(`${month}-01`));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
}

export function getWeekdayNumber(date: string | Date): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return getDay(d);
}

export function getPreviousDay(date: string): string {
  return format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
}

export function getNextDay(date: string): string {
  return format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
}

// Check if slot is PM (evening) slot
export function isPMSlot(slotCode: SlotCode): boolean {
  return slotCode === 'WD_PM' || slotCode === 'WE_PM';
}

// Check if slot is AM (morning) slot
export function isAMSlot(slotCode: SlotCode): boolean {
  return slotCode === 'WD_AM' || slotCode === 'WE_AM';
}

// Get slot template by code
export function getSlotTemplate(slotCode: SlotCode): ShiftTemplate | undefined {
  return SHIFT_TEMPLATES.find(t => t.slot_code === slotCode);
}

// Calculate slot count for a month
export function countSlotsInMonth(month: string): Record<SlotCode, number> {
  const days = getDaysInMonth(month);
  const counts: Record<SlotCode, number> = {
    WD_AM: 0,
    WD_PM: 0,
    WE_AM: 0,
    WE_MD: 0,
    WE_PM: 0,
  };
  
  days.forEach(date => {
    const slots = getSlotCodesForDay(date);
    slots.forEach(slot => {
      counts[slot]++;
    });
  });
  
  return counts;
}

// Format time range
export function formatTimeRange(start: string, end: string): string {
  return `${start} - ${end}`;
}

// Safely parse JSON
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
