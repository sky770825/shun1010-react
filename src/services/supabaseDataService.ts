/**
 * Supabase 後端實作：所有函式為 async，供 dataService 在 USE_SUPABASE 時委派。
 */

import { supabase } from "@/lib/supabase";
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
} from "@/types";
import { generateId } from "@/lib/utils";
import { DEFAULT_FAIRNESS_SETTINGS, DEFAULT_SAME_DAY_PAIRS } from "@/lib/constants";

function assertSupabase() {
  if (!supabase) throw new Error("Supabase 未設定：請填寫 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY");
}

// ======================== Members ========================

export async function getMembers(): Promise<Member[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("members").select("*").order("id");
  if (error) throw error;
  return (data ?? []) as Member[];
}

export async function upsertMember(member: Partial<Member> & { name: string }): Promise<Member> {
  assertSupabase();
  const now = new Date().toISOString();
  const row = {
    id: member.id || generateId("M"),
    name: member.name,
    is_active: member.is_active ?? true,
    exclude_roster: member.exclude_roster ?? false,
    role: member.role ?? "member",
    max_shifts_per_day: member.max_shifts_per_day ?? 1,
    note: member.note ?? null,
    created_at: member.created_at ?? now,
    updated_at: now,
  };
  const { data, error } = await supabase!.from("members").upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data as Member;
}

export async function setMemberActive(memberId: string, isActive: boolean): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("members").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", memberId);
  if (error) throw error;
}

export async function setExcludeRoster(memberId: string, exclude: boolean): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("members").update({ exclude_roster: exclude, updated_at: new Date().toISOString() }).eq("id", memberId);
  if (error) throw error;
}

export async function deleteMember(memberId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("members").delete().eq("id", memberId);
  if (error) throw error;
}

// ======================== Availability Rules ========================

export async function getRules(): Promise<AvailabilityRule[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("availability_rules").select("*").order("rule_id");
  if (error) throw error;
  return (data ?? []) as AvailabilityRule[];
}

export async function getRulesByMember(memberId: string): Promise<AvailabilityRule[]> {
  const rules = await getRules();
  return rules.filter((r) => r.member_id === memberId);
}

export async function upsertRule(
  rule: Partial<AvailabilityRule> & { member_id: string; rule_type: AvailabilityRule["rule_type"] }
): Promise<AvailabilityRule> {
  assertSupabase();
  const now = new Date().toISOString();
  const row = {
    rule_id: rule.rule_id || generateId("R"),
    member_id: rule.member_id,
    rule_type: rule.rule_type,
    action: rule.action ?? "blocked",
    weekday: rule.weekday ?? null,
    date: rule.date ?? null,
    start_date: rule.start_date ?? null,
    end_date: rule.end_date ?? null,
    slot_code: rule.slot_code ?? "any",
    reason: rule.reason ?? "",
    priority: rule.priority ?? 100,
    is_active: rule.is_active ?? true,
    created_at: rule.created_at ?? now,
    updated_at: now,
  };
  const { data, error } = await supabase!.from("availability_rules").upsert(row, { onConflict: "rule_id" }).select().single();
  if (error) throw error;
  return data as AvailabilityRule;
}

export async function deleteRule(ruleId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("availability_rules").delete().eq("rule_id", ruleId);
  if (error) throw error;
}

export async function deleteRules(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;
  assertSupabase();
  const { error } = await supabase!.from("availability_rules").delete().in("rule_id", ruleIds);
  if (error) throw error;
}

export async function toggleRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  assertSupabase();
  const { error } = await supabase!
    .from("availability_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("rule_id", ruleId);
  if (error) throw error;
}

// ======================== Roster Slots ========================

export async function getRosterSlots(month: string): Promise<RosterSlot[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("roster_slots").select("*").like("date", `${month}%`).order("date");
  if (error) throw error;
  return (data ?? []) as RosterSlot[];
}

export async function getAllRosterSlots(): Promise<RosterSlot[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("roster_slots").select("*").order("date");
  if (error) throw error;
  return (data ?? []) as RosterSlot[];
}

export async function setRosterSlot(
  date: string,
  slotCode: SlotCode,
  assigneeId: string | null,
  options?: { is_substitute?: boolean; original_assignee_id?: string | null; status?: RosterStatus }
): Promise<RosterSlot> {
  assertSupabase();
  const now = new Date().toISOString();
  const row: RosterSlot = {
    date,
    slot_code: slotCode,
    assignee_id: assigneeId,
    is_substitute: options?.is_substitute ?? false,
    original_assignee_id: options?.original_assignee_id ?? null,
    status: options?.status ?? "draft",
    updated_at: now,
  };
  const { data, error } = await supabase!.from("roster_slots").upsert(row, { onConflict: "date,slot_code" }).select().single();
  if (error) throw error;
  return data as RosterSlot;
}

export async function clearMonthDraft(month: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("roster_slots").delete().like("date", `${month}%`).eq("status", "draft");
  if (error) throw error;
}

export async function publishMonth(month: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("roster_slots").update({ status: "published", updated_at: new Date().toISOString() }).like("date", `${month}%`);
  if (error) throw error;
}

export async function lockMonth(month: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("roster_slots").update({ status: "locked", updated_at: new Date().toISOString() }).like("date", `${month}%`);
  if (error) throw error;
}

export async function unlockMonth(month: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("roster_slots").update({ status: "published", updated_at: new Date().toISOString() }).like("date", `${month}%`).eq("status", "locked");
  if (error) throw error;
}

export async function replaceRosterSlotsForMonth(month: string, slots: RosterSlot[]): Promise<void> {
  assertSupabase();
  await supabase!.from("roster_slots").delete().like("date", `${month}%`);
  if (slots.length > 0) {
    const { error } = await supabase!.from("roster_slots").insert(slots);
    if (error) throw error;
  }
}

// ======================== Duty Balance ========================

export async function getDutyBalance(month: string): Promise<DutyBalance[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("duty_balance").select("*").eq("month", month);
  if (error) throw error;
  return (data ?? []) as DutyBalance[];
}

export async function getAllDutyBalance(): Promise<DutyBalance[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("duty_balance").select("*").order("month");
  if (error) throw error;
  return (data ?? []) as DutyBalance[];
}

export async function upsertDutyBalance(balance: DutyBalance): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("duty_balance").upsert(balance, { onConflict: "month,member_id" });
  if (error) throw error;
}

// ======================== Fairness Settings ========================

export async function getFairnessSettings(): Promise<FairnessSettings> {
  assertSupabase();
  const { data, error } = await supabase!.from("fairness_settings").select("*").eq("id", 1).single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as FairnessSettings) ?? DEFAULT_FAIRNESS_SETTINGS;
}

export async function updateFairnessSettings(settings: Partial<FairnessSettings>): Promise<FairnessSettings> {
  assertSupabase();
  const { data: cur } = await supabase!.from("fairness_settings").select("*").eq("id", 1).single();
  const merged = { ...(cur ?? DEFAULT_FAIRNESS_SETTINGS), ...settings };
  const { data, error } = await supabase!.from("fairness_settings").upsert({ id: 1, ...merged }, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data as FairnessSettings;
}

// ======================== Same-Day Pairs ========================

export async function getSameDayPairs(): Promise<[string, string][]> {
  assertSupabase();
  const { data, error } = await supabase!.from("same_day_pairs").select("member_a, member_b").order("id");
  if (error) throw error;
  return (data ?? []).map((r: { member_a: string; member_b: string }) => [r.member_a, r.member_b] as [string, string]);
}

export async function setSameDayPairs(pairs: [string, string][]): Promise<void> {
  assertSupabase();
  await supabase!.from("same_day_pairs").delete().neq("id", 0);
  if (pairs.length > 0) {
    const rows = pairs.map(([a, b]) => ({ member_a: a, member_b: b }));
    const { error } = await supabase!.from("same_day_pairs").insert(rows);
    if (error) throw error;
  }
}

// ======================== Keys ========================

export async function getKeys(): Promise<KeyItem[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("keys").select("*").order("key_id");
  if (error) throw error;
  return (data ?? []) as KeyItem[];
}

export async function upsertKey(key: Partial<KeyItem> & { key_name: string }): Promise<KeyItem> {
  assertSupabase();
  const now = new Date().toISOString();
  const row = {
    key_id: key.key_id || generateId("K"),
    key_name: key.key_name,
    address: key.address ?? null,
    is_active: key.is_active ?? true,
    note: key.note ?? null,
    created_at: key.created_at ?? now,
    updated_at: now,
  };
  const { data, error } = await supabase!.from("keys").upsert(row, { onConflict: "key_id" }).select().single();
  if (error) throw error;
  return data as KeyItem;
}

export async function toggleKeyActive(keyId: string, isActive: boolean): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("keys").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("key_id", keyId);
  if (error) throw error;
}

export async function deleteKey(keyId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("keys").delete().eq("key_id", keyId);
  if (error) throw error;
}

// ======================== Lendings ========================

export async function getLendings(): Promise<Lending[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("lendings").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lending[];
}

export async function getLendingItems(): Promise<LendingItem[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("lending_items").select("*");
  if (error) throw error;
  return (data ?? []) as LendingItem[];
}

export async function getLendingWithItems(lendingId: string): Promise<{ lending: Lending; items: LendingItem[] } | null> {
  const [lendings, items] = await Promise.all([getLendings(), getLendingItems()]);
  const lending = lendings.find((l) => l.lending_id === lendingId);
  if (!lending) return null;
  return { lending, items: items.filter((i) => i.lending_id === lendingId) };
}

export async function createLending(
  lending: Omit<Lending, "lending_id" | "created_at" | "status">,
  items: Array<{ key_id?: string; key_name: string; qty?: number }>
): Promise<{ lending: Lending; items: LendingItem[] }> {
  assertSupabase();
  const now = new Date().toISOString();
  const newLending: Lending = { lending_id: generateId("L"), created_at: now, status: "out", ...lending };
  const { error: e1 } = await supabase!.from("lendings").insert(newLending);
  if (e1) throw e1;
  const newItems: LendingItem[] = items.map((item) => ({
    id: generateId("LI"),
    lending_id: newLending.lending_id,
    key_id: item.key_id ?? null,
    key_name: item.key_name,
    qty: item.qty ?? 1,
  }));
  const { error: e2 } = await supabase!.from("lending_items").insert(newItems);
  if (e2) throw e2;
  return { lending: newLending, items: newItems };
}

export async function markReturned(lendingId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!
    .from("lendings")
    .update({ status: "returned", returned_at: new Date().toISOString() })
    .eq("lending_id", lendingId);
  if (error) throw error;
}

export async function confirmDuty(lendingId: string, confirmerMemberId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!
    .from("lendings")
    .update({ duty_confirmed_by: confirmerMemberId, duty_confirmed_at: new Date().toISOString() })
    .eq("lending_id", lendingId);
  if (error) throw error;
}

export async function listLendings(filters?: {
  status?: "out" | "returned" | "returning" | "cancelled" | "all";
  borrower_type?: "member" | "partner" | "all";
  search?: string;
  date?: string;
}): Promise<Array<{ lending: Lending; items: LendingItem[] }>> {
  let lendings = await getLendings();
  const allItems = await getLendingItems();
  if (filters?.date) lendings = lendings.filter((l) => l.created_at.startsWith(filters!.date!));
  if (filters?.status && filters.status !== "all") lendings = lendings.filter((l) => l.status === filters!.status);
  if (filters?.borrower_type && filters.borrower_type !== "all") lendings = lendings.filter((l) => l.borrower_type === filters!.borrower_type);
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    lendings = lendings.filter(
      (l) =>
        l.borrower_name.toLowerCase().includes(s) ||
        (l.partner_company?.toLowerCase().includes(s) ?? false) ||
        allItems.some((i) => i.lending_id === l.lending_id && i.key_name.toLowerCase().includes(s))
    );
  }
  lendings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return lendings.map((lending) => ({ lending, items: allItems.filter((i) => i.lending_id === lending.lending_id) }));
}

// ======================== App Versions ========================

export async function getVersions(): Promise<AppVersion[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("app_versions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppVersion[];
}

export async function getVersionsByMonth(month: string): Promise<AppVersion[]> {
  const all = await getVersions();
  return all.filter((v) => v.month === month).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function saveVersion(month: string, note?: string): Promise<AppVersion> {
  assertSupabase();
  const slots = await getRosterSlots(month);
  const version: AppVersion = { version_id: generateId("V"), created_at: new Date().toISOString(), month, roster_snapshot: slots, note };
  const { error } = await supabase!.from("app_versions").insert(version);
  if (error) throw error;
  return version;
}

export async function deleteVersion(versionId: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("app_versions").delete().eq("version_id", versionId);
  if (error) throw error;
}

// ======================== Temp Duty ========================

export async function getTempDuty(date: string): Promise<Partial<Record<SlotCode, string>>> {
  assertSupabase();
  const { data, error } = await supabase!.from("temp_duty").select("slot_code, member_id").eq("date", date);
  if (error) throw error;
  const out: Partial<Record<SlotCode, string>> = {};
  (data ?? []).forEach((r: { slot_code: string; member_id: string }) => { out[r.slot_code as SlotCode] = r.member_id; });
  return out;
}

export async function setTempDuty(date: string, overrides: Partial<Record<SlotCode, string>>): Promise<void> {
  assertSupabase();
  await supabase!.from("temp_duty").delete().eq("date", date);
  const rows = Object.entries(overrides).filter(([, v]) => !!v).map(([slot_code, member_id]) => ({ date, slot_code, member_id: member_id! }));
  if (rows.length > 0) {
    const { error } = await supabase!.from("temp_duty").insert(rows);
    if (error) throw error;
  }
}

export async function clearTempDuty(date: string): Promise<void> {
  assertSupabase();
  const { error } = await supabase!.from("temp_duty").delete().eq("date", date);
  if (error) throw error;
}

// ======================== Key Item History ========================

export async function getKeyItemHistory(): Promise<string[]> {
  assertSupabase();
  const { data, error } = await supabase!.from("key_item_history").select("key_name").order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: { key_name: string }) => r.key_name);
}

export async function addKeyItemToHistory(keyName: string): Promise<void> {
  if (!keyName?.trim()) return;
  assertSupabase();
  let arr = (await getKeyItemHistory()).filter((s) => s.toLowerCase() !== keyName.trim().toLowerCase());
  arr = [keyName.trim(), ...arr].slice(0, 15);
  const { data: existing } = await supabase!.from("key_item_history").select("key_name");
  const keys = (existing ?? []).map((r: { key_name: string }) => r.key_name);
  if (keys.length > 0) await supabase!.from("key_item_history").delete().in("key_name", keys);
  if (arr.length > 0) {
    const rows = arr.map((key_name, i) => ({ key_name, sort_order: i }));
    const { error } = await supabase!.from("key_item_history").insert(rows);
    if (error) throw error;
  }
}

export async function clearKeyItemHistory(): Promise<void> {
  assertSupabase();
  const { data } = await supabase!.from("key_item_history").select("key_name");
  const keys = (data ?? []).map((r: { key_name: string }) => r.key_name);
  if (keys.length > 0) await supabase!.from("key_item_history").delete().in("key_name", keys);
}
