// ========================
// Core Types for Duty Scheduler & Key Management
// ========================

export type Role = 'admin' | 'editor' | 'staff' | 'member';
export type DayType = 'weekday' | 'weekend';
export type SlotCode = 'WD_AM' | 'WD_PM' | 'WE_AM' | 'WE_MD' | 'WE_PM';
export type RosterStatus = 'draft' | 'published' | 'locked';
export type RuleType = 'weekly' | 'date' | 'range';
export type RuleAction = 'blocked' | 'allowed';
export type BorrowerType = 'member' | 'partner';
export type LendingStatus = 'out' | 'returning' | 'returned' | 'cancelled';

// Member
export interface Member {
  id: string;
  name: string;
  is_active: boolean;
  exclude_roster: boolean;
  role: Role;
  max_shifts_per_day: number;
  note?: string;
  created_at: string;
  updated_at: string;
}

// Shift Template (fixed, built-in)
export interface ShiftTemplate {
  slot_code: SlotCode;
  day_type: DayType;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  sort_order: number;
  label: string;
}

// Roster Slot
export interface RosterSlot {
  date: string; // YYYY-MM-DD
  slot_code: SlotCode;
  assignee_id: string | null;
  is_substitute: boolean;
  original_assignee_id: string | null;
  status: RosterStatus;
  updated_at: string;
}

// Availability Rule
export interface AvailabilityRule {
  rule_id: string;
  member_id: string;
  rule_type: RuleType;
  action: RuleAction;
  weekday?: number; // 0-6 (Sunday-Saturday)
  date?: string; // YYYY-MM-DD
  start_date?: string;
  end_date?: string;
  slot_code: SlotCode | 'any';
  reason: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Duty Balance (fairness tracking)
export interface DutyBalance {
  month: string; // YYYY-MM
  member_id: string;
  assigned_WD_AM: number;
  assigned_WD_PM: number;
  assigned_WE_AM: number;
  assigned_WE_MD: number;
  assigned_WE_PM: number;
  carry_WD_AM: number;
  carry_WD_PM: number;
  carry_WE_AM: number;
  carry_WE_MD: number;
  carry_WE_PM: number;
  assigned_total: number;
  carry_total: number;
  updated_at: string;
}

// Fairness Settings
export interface FairnessSettings {
  slot_weights: Record<SlotCode, number>;
  carry_months: number;
  carry_strength: number;
  max_shifts_per_day: number;
  no_close_to_open: boolean;
  enable_auto_swap: boolean;
  max_retries: number;
  allow_soften_close_to_open: boolean;
  allow_two_shifts_per_day: boolean;
}

// Key Catalog
export interface KeyItem {
  key_id: string;
  key_name: string;
  address?: string;
  is_active: boolean;
  note?: string;
  created_at: string;
  updated_at: string;
}

// Lending
export interface Lending {
  lending_id: string;
  created_at: string;
  borrower_type: BorrowerType;
  borrower_name: string;
  borrower_member_id?: string;
  partner_company?: string;
  partner_contact?: string;
  status: LendingStatus;
  returned_at?: string;
  duty_confirmed_by?: string;
  duty_confirmed_at?: string;
  note?: string;
}

// Lending Item
export interface LendingItem {
  id: string;
  lending_id: string;
  key_id?: string;
  key_name: string;
  qty: number;
}

// App Version (for rollback)
export interface AppVersion {
  version_id: string;
  created_at: string;
  month: string;
  roster_snapshot: RosterSlot[];
  note?: string;
}

// External Links Config
export interface ExternalLink {
  id: string;
  title: string;
  url: string;
  icon?: string;
  description?: string;
}

// UI State Types
export interface MonthStatus {
  month: string;
  status: RosterStatus;
  missing_count: number;
  total_slots: number;
}

export interface SlotAssignment {
  slot: RosterSlot;
  member: Member | null;
  is_available: boolean;
  unavailable_reason?: string;
}

export interface ScheduleReport {
  missing_slots: Array<{ date: string; slot_code: SlotCode }>;
  member_stats: Array<{
    member: Member;
    assigned: Record<SlotCode, number>;
    target: Record<SlotCode, number>;
    carry: Record<SlotCode, number>;
  }>;
  /** 該班型在當月 roster 的格數，用於目標計算與 tooltip */
  slot_counts: Record<SlotCode, number>;
  /** 排班人數（getEligibleMembers 數量） */
  eligible_count: number;
  we_pm_balance: {
    most: { member: Member; count: number } | null;
    least: { member: Member; count: number } | null;
  };
  next_month_carry: Array<{
    member: Member;
    carry: Record<SlotCode, number>;
    total: number;
  }>;
}
