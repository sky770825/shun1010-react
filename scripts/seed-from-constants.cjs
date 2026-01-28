const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// ===== 專案內建常數（從 src/lib/constants.ts 複製） =====

const DEFAULT_LEGACY_MEMBERS = [
  { id: "01", name: "以蓁" },
  { id: "03", name: "顯宗" },
  { id: "05", name: "莉羚" },
  { id: "06", name: "秋屏" },
  { id: "07", name: "林鋒" },
  { id: "08", name: "秀華" },
  { id: "09", name: "盈橙" },
  { id: "10", name: "大同" },
  { id: "11", name: "曉敏" },
  { id: "12", name: "雅婷" },
  { id: "13", name: "瑀嬅" },
  { id: "15", name: "皓宇" },
  { id: "16", name: "永樺" },
  { id: "17", name: "范沅" },
  { id: "18", name: "志桓" },
  { id: "19", name: "子菲" },
  { id: "20", name: "志偉" },
  { id: "21", name: "郁庭" },
  { id: "23", name: "珈瑜" },
  { id: "25", name: "濬瑒" },
  { id: "26", name: "益呈" },
  { id: "90", name: "徐店東", exclude_roster: true },
  { id: "91", name: "簡副總", exclude_roster: true },
  { id: "92", name: "王店", exclude_roster: true },
  { id: "93", name: "曾經理", exclude_roster: true },
  { id: "94", name: "羅珍妮", exclude_roster: true },
];

const DEFAULT_AVAILABILITY_RULES = [
  { member_id: "01", weekday: 0 },
  { member_id: "01", weekday: 1 },
  { member_id: "01", weekday: 2 },
  { member_id: "01", weekday: 3 },
  { member_id: "01", weekday: 5 },
  { member_id: "01", weekday: 6 },
  { member_id: "06", weekday: 5 },
  { member_id: "07", weekday: 5 },
  { member_id: "08", weekday: 2 },
  { member_id: "09", weekday: 1 },
  { member_id: "09", weekday: 4 },
  { member_id: "10", weekday: 1 },
  { member_id: "10", weekday: 4 },
  { member_id: "12", weekday: 1 },
  { member_id: "12", weekday: 4 },
  { member_id: "12", weekday: 5 },
  { member_id: "13", weekday: 1 },
  { member_id: "13", weekday: 4 },
  { member_id: "13", weekday: 5 },
  { member_id: "18", weekday: 2 },
  { member_id: "19", weekday: 1 },
  { member_id: "19", weekday: 4 },
  { member_id: "23", weekday: 5 },
  { member_id: "25", weekday: 1 },
  { member_id: "25", weekday: 4 },
];

const DEFAULT_SAME_DAY_PAIRS = [
  ["19", "25"],
  ["12", "13"],
  ["09", "10"],
];

const DEFAULT_EXTERNAL_LINKS = [
  {
    id: "objects-table",
    title: "物件總表",
    url: "#",
    icon: "FileSpreadsheet",
    description: "查看所有物件資料",
  },
  {
    id: "huyi-login",
    title: "虎翼登入系統",
    url: "#",
    icon: "LogIn",
    description: "登入虎翼系統",
  },
  {
    id: "objects-form",
    title: "物件資料表單",
    url: "#",
    icon: "ClipboardList",
    description: "填寫物件資料",
  },
  {
    id: "land-form",
    title: "土地物件資料表單",
    url: "#",
    icon: "Map",
    description: "填寫土地物件資料",
  },
];

const DEFAULT_FAIRNESS_SETTINGS = {
  slot_weights: {
    WE_PM: 1.4,
    WE_MD: 1.2,
    WE_AM: 1.1,
    WD_PM: 1.1,
    WD_AM: 1.0,
  },
  carry_months: 2,
  carry_strength: 1.0,
  max_shifts_per_day: 1,
  no_close_to_open: true,
  enable_auto_swap: true,
  max_retries: 30,
  allow_soften_close_to_open: false,
  allow_two_shifts_per_day: false,
};

const WEEKDAY_NAMES_FULL = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

// 2026 年 2 月班表（與 dataService.FEB_2026_ROSTER 一致）
const FEB_2026_ROSTER = [
  { d: 1, am: "07", md: "25", pm: "19" },
  { d: 2, am: "03", pm: "05" },
  { d: 3, am: "13", pm: "12" },
  { d: 4, am: "10", pm: "09" },
  { d: 5, am: "01", pm: "06" },
  { d: 6, am: "19", pm: "25" },
  { d: 7, am: "20", md: "09", pm: "10" },
  { d: 8, am: "11", md: "13", pm: "12" },
  { d: 9, am: "17", pm: "16" },
  { d: 10, am: "15", pm: "21" },
  { d: 11, am: "11", pm: "26" },
  { d: 12, am: "18", pm: "01" },
  { d: 13, am: "16", pm: "20" },
  { d: 14, am: "05", md: "15", pm: "03" },
  { d: 15, am: "26", md: "21", pm: "17" },
  { d: 16, am: "07", pm: "03" },
  { d: 17, am: "09", pm: "10" },
  { d: 18, am: "25", pm: "19" },
  { d: 19, am: "06", pm: "07" },
  { d: 20, am: "05", pm: "15" },
  { d: 21, am: "16", md: "06", pm: "18" },
  { d: 22, am: "17", md: "12", pm: "13" },
  { d: 23, am: "20", pm: "11" },
  { d: 24, am: "12", pm: "13" },
  { d: 25, am: "26", pm: "17" },
  { d: 26, am: "01", pm: "18" },
  { d: 27, am: "21", pm: "25" },
  { d: 28, am: "06", md: "10", pm: "09" },
];

// ===== Helper =====

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

// ===== Seed 實作 =====

async function seedMembers() {
  logSection("Seed members (DEFAULT_LEGACY_MEMBERS)");
  const { data: existing, error } = await supabase.from("members").select("id");
  if (error) throw error;
  const existingIds = new Set((existing || []).map((r) => r.id));

  const toInsert = DEFAULT_LEGACY_MEMBERS.filter((m) => !existingIds.has(m.id)).map((m) => ({
    id: m.id,
    name: m.name,
    is_active: true,
    exclude_roster: m.exclude_roster ?? false,
    role: "member",
    max_shifts_per_day: 1,
  }));

  if (toInsert.length === 0) {
    console.log("members：無需新增（全部已存在）");
    return;
  }

  const { error: e2 } = await supabase.from("members").insert(toInsert);
  if (e2) throw e2;
  console.log(`members：已新增 ${toInsert.length} 筆`);
}

async function seedAvailabilityRules() {
  logSection("Seed availability_rules (DEFAULT_AVAILABILITY_RULES)");
  const { data: existing, error } = await supabase
    .from("availability_rules")
    .select("member_id, rule_type, weekday, slot_code");
  if (error) throw error;

  const rules = existing || [];
  const toInsert = [];

  for (const { member_id, weekday } of DEFAULT_AVAILABILITY_RULES) {
    const has = rules.some(
      (r) =>
        r.member_id === member_id &&
        r.rule_type === "weekly" &&
        r.weekday === weekday &&
        (r.slot_code === "any" || r.slot_code == null)
    );
    if (has) continue;
    toInsert.push({
      // 產生 deterministic rule_id，避免重複插入
      rule_id: `seed_${member_id}_${weekday}`,
      member_id,
      rule_type: "weekly",
      action: "blocked",
      weekday,
      slot_code: "any",
      reason: `每${WEEKDAY_NAMES_FULL[weekday]}不可排`,
      priority: 100,
      is_active: true,
    });
  }

  if (toInsert.length === 0) {
    console.log("availability_rules：無需新增（全部已存在或已有 weekly 規則）");
    return;
  }

  const { error: e2 } = await supabase.from("availability_rules").insert(toInsert);
  if (e2) throw e2;
  console.log(`availability_rules：已新增 ${toInsert.length} 筆`);
}

async function seedSameDayPairs() {
  logSection("Seed same_day_pairs (DEFAULT_SAME_DAY_PAIRS)");
  const { data: existing, error } = await supabase.from("same_day_pairs").select("member_a, member_b");
  if (error) throw error;
  const pairs = existing || [];
  const existingKeys = new Set(
    pairs.map((r) => {
      const a = r.member_a;
      const b = r.member_b;
      return [a, b].sort().join("|");
    })
  );

  const toInsert = [];
  for (const [a, b] of DEFAULT_SAME_DAY_PAIRS) {
    const key = [a, b].sort().join("|");
    if (existingKeys.has(key)) continue;
    toInsert.push({ member_a: a, member_b: b });
  }

  if (toInsert.length === 0) {
    console.log("same_day_pairs：無需新增（全部已存在）");
    return;
  }

  const { error: e2 } = await supabase.from("same_day_pairs").insert(toInsert);
  if (e2) throw e2;
  console.log(`same_day_pairs：已新增 ${toInsert.length} 筆`);
}

async function seedExternalLinks() {
  logSection("Seed external_links (DEFAULT_EXTERNAL_LINKS)");
  const { data: existing, error } = await supabase.from("external_links").select("id");
  if (error) throw error;
  const ids = new Set((existing || []).map((r) => r.id));

  const toInsert = DEFAULT_EXTERNAL_LINKS.filter((l) => !ids.has(l.id));
  if (toInsert.length === 0) {
    console.log("external_links：無需新增（全部已存在）");
    return;
  }

  const { error: e2 } = await supabase.from("external_links").insert(toInsert);
  if (e2) throw e2;
  console.log(`external_links：已新增 ${toInsert.length} 筆`);
}

async function seedFairnessSettings() {
  logSection("Seed fairness_settings (DEFAULT_FAIRNESS_SETTINGS)");
  const { data, error } = await supabase.from("fairness_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (data) {
    console.log("fairness_settings：已存在 id=1，保留現有設定");
    return;
  }

  const row = {
    id: 1,
    slot_weights: DEFAULT_FAIRNESS_SETTINGS.slot_weights,
    carry_months: DEFAULT_FAIRNESS_SETTINGS.carry_months,
    carry_strength: DEFAULT_FAIRNESS_SETTINGS.carry_strength,
    max_shifts_per_day: DEFAULT_FAIRNESS_SETTINGS.max_shifts_per_day,
    no_close_to_open: DEFAULT_FAIRNESS_SETTINGS.no_close_to_open,
    enable_auto_swap: DEFAULT_FAIRNESS_SETTINGS.enable_auto_swap,
    max_retries: DEFAULT_FAIRNESS_SETTINGS.max_retries,
    allow_soften_close_to_open: DEFAULT_FAIRNESS_SETTINGS.allow_soften_close_to_open,
    allow_two_shifts_per_day: DEFAULT_FAIRNESS_SETTINGS.allow_two_shifts_per_day,
  };

  const { error: e2 } = await supabase.from("fairness_settings").insert(row);
  if (e2) throw e2;
  console.log("fairness_settings：已新增預設 id=1");
}

async function seedFebruary2026Roster() {
  logSection("Seed roster_slots for 2026-02 (FEB_2026_ROSTER)");
  const month = "2026-02";
  const { data: existing, error } = await supabase
    .from("roster_slots")
    .select("date")
    .like("date", `${month}%`)
    .limit(1);
  if (error) throw error;
  if (existing && existing.length > 0) {
    console.log("roster_slots：2026-02 已有資料，略過匯入");
    return;
  }

  const rows = [];
  for (const row of FEB_2026_ROSTER) {
    const date = `${month}-${String(row.d).padStart(2, "0")}`;
    const wd = new Date(date).getDay(); // 0=日,6=六
    const isWeekend = wd === 0 || wd === 6;

    const pushSlot = (slotKey, slotCode) => {
      const memberId =
        slotKey === "am" ? row.am : slotKey === "md" ? row.md : row.pm;
      if (!memberId) return;
      rows.push({
        date,
        slot_code: slotCode,
        assignee_id: memberId,
        is_substitute: false,
        original_assignee_id: null,
        status: "draft",
        updated_at: new Date().toISOString(),
      });
    };

    if (isWeekend) {
      pushSlot("am", "WE_AM");
      pushSlot("md", "WE_MD");
      pushSlot("pm", "WE_PM");
    } else {
      pushSlot("am", "WD_AM");
      pushSlot("pm", "WD_PM");
    }
  }

  if (rows.length === 0) {
    console.log("roster_slots：無任何要匯入的班表資料");
    return;
  }

  const { error: e2 } = await supabase.from("roster_slots").insert(rows);
  if (e2) throw e2;
  console.log(`roster_slots：已為 2026-02 匯入 ${rows.length} 筆`);
}

async function main() {
  try {
    await seedMembers();
    await seedAvailabilityRules();
    await seedSameDayPairs();
    await seedExternalLinks();
    await seedFairnessSettings();
    await seedFebruary2026Roster();
    console.log("\n✅ seed-from-constants 完成");
    process.exit(0);
  } catch (e) {
    console.error("Seed 失敗：", e);
    process.exit(1);
  }
}

main();

