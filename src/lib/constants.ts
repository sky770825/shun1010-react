import type { ShiftTemplate, SlotCode, FairnessSettings, ExternalLink } from '@/types';

// ========================
// 專案命名（project_key: shun1010）
// ========================
// 標籤格式: ns.<key>.<value>
// 事件格式: ns.<event_name>
// 角色: admin | editor | staff | member

export const PROJECT_NAMING = {
  project_key: 'shun1010',
  ns: 'ns',
  schema: 'app_shun1010',
  storage_prefix: 'app/shun1010/',
  /** 標籤：ns.<key>.<value> */
  tag: (key: string, value: string) => `ns.${key}.${value}` as const,
  /** 事件：ns.<event_name> */
  event: (event_name: string) => `ns.${event_name}` as const,
} as const;

export const ROLES = ['admin', 'editor', 'staff', 'member'] as const;

// ========================
// Storage 規範（共用 bucket: public）
// ========================
// prefix 固定：app/shun1010/
// 後台上傳：BASE_PATH=app/shun1010/；成功後 url→app_shun1010.media_assets.url，thumbnail_url→app_shun1010.media_assets.thumbnail_url

export const STORAGE_CONVENTION = {
  bucket: 'public',
  BASE_PATH: 'app/shun1010/',
  /** app_shun1010.media_assets 欄位 */
  media_assets: {
    url: 'url',
    thumbnail_url: 'thumbnail_url',
  },
  /** 子目錄路徑（回傳相對 BASE_PATH 的 path，不含檔名） */
  paths: {
    site: {
      hero: () => 'site/hero/',
      icons: () => 'site/icons/',
    },
    article: (article_id: string) => `articles/${article_id}/cover/`,
    articleAssets: (article_id: string) => `articles/${article_id}/assets/`,
    work: (work_id: string) => `works/${work_id}/`,
    listing: (listing_id: string) => `listings/${listing_id}/`,
    member: (user_id: string) => `members/${user_id}/`,
  },
  /** 完整路徑：BASE_PATH + paths.xxx(...) */
  fullPath: (relative: string) => `app/shun1010/${relative}` as const,
} as const;

// Built-in Shift Templates
export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { slot_code: 'WD_AM', day_type: 'weekday', start_time: '09:30', end_time: '15:30', sort_order: 1, label: '早班' },
  { slot_code: 'WD_PM', day_type: 'weekday', start_time: '15:30', end_time: '21:30', sort_order: 2, label: '晚班' },
  { slot_code: 'WE_AM', day_type: 'weekend', start_time: '09:30', end_time: '13:30', sort_order: 3, label: '早班' },
  { slot_code: 'WE_MD', day_type: 'weekend', start_time: '13:30', end_time: '17:30', sort_order: 4, label: '午班' },
  { slot_code: 'WE_PM', day_type: 'weekend', start_time: '17:30', end_time: '21:30', sort_order: 5, label: '晚班' },
];

// Default Fairness Settings
export const DEFAULT_FAIRNESS_SETTINGS: FairnessSettings = {
  slot_weights: {
    WE_PM: 1.40,
    WE_MD: 1.20,
    WE_AM: 1.10,
    WD_PM: 1.10,
    WD_AM: 1.00,
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

// Slot code display info（short 保留相容；優先使用 time 顯示時段）
export const SLOT_INFO: Record<SlotCode, { label: string; short: string; time: string; color: string }> = {
  WD_AM: { label: '平日早班', short: 'AM', time: '09:30-15:30', color: 'slot-am' },
  WD_PM: { label: '平日晚班', short: 'PM', time: '15:30-21:30', color: 'slot-pm' },
  WE_AM: { label: '假日早班', short: 'AM', time: '09:30-13:30', color: 'slot-am' },
  WE_MD: { label: '假日午班', short: 'MD', time: '13:30-17:30', color: 'slot-md' },
  WE_PM: { label: '假日晚班', short: 'PM', time: '17:30-21:30', color: 'slot-pm' },
};

// Priority order for scheduling (harder to fill first)
export const SCHEDULING_ORDER: SlotCode[] = [
  'WE_PM',  // 最難填
  'WE_MD',
  'WE_AM',
  'WD_PM',
  'WD_AM',  // 最容易填
];

// Weekday names
export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEKDAY_NAMES_FULL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// Default External Links
export const DEFAULT_EXTERNAL_LINKS: ExternalLink[] = [
  {
    id: 'objects-table',
    title: '物件總表',
    url: '#',
    icon: 'FileSpreadsheet',
    description: '查看所有物件資料',
  },
  {
    id: 'huyi-login',
    title: '虎翼登入系統',
    url: '#',
    icon: 'LogIn',
    description: '登入虎翼系統',
  },
  {
    id: 'objects-form',
    title: '物件資料表單',
    url: '#',
    icon: 'ClipboardList',
    description: '填寫物件資料',
  },
  {
    id: 'land-form',
    title: '土地物件資料表單',
    url: '#',
    icon: 'Map',
    description: '填寫土地物件資料',
  },
];

// 常順預設成員（由舊班表移入，exclude_roster=true 表示不參與排班）
export const DEFAULT_LEGACY_MEMBERS: { id: string; name: string; exclude_roster?: boolean }[] = [
  { id: '01', name: '以蓁' },
  { id: '03', name: '顯宗' },
  { id: '05', name: '莉羚' },
  { id: '06', name: '秋屏' },
  { id: '07', name: '林鋒' },
  { id: '08', name: '秀華' },
  { id: '09', name: '盈橙' },
  { id: '10', name: '大同' },
  { id: '11', name: '曉敏' },
  { id: '12', name: '雅婷' },
  { id: '13', name: '瑀嬅' },
  { id: '15', name: '皓宇' },
  { id: '16', name: '永樺' },
  { id: '17', name: '范沅' },
  { id: '18', name: '志桓' },
  { id: '19', name: '子菲' },
  { id: '20', name: '志偉' },
  { id: '21', name: '郁庭' },
  { id: '23', name: '珈瑜' },
  { id: '25', name: '濬瑒' },
  { id: '26', name: '益呈' },
  { id: '90', name: '徐店東', exclude_roster: true },
  { id: '91', name: '簡副總', exclude_roster: true },
  { id: '92', name: '王店', exclude_roster: true },
  { id: '93', name: '曾經理', exclude_roster: true },
  { id: '94', name: '羅珍妮', exclude_roster: true },
];

// Storage Keys（前綴 app/shun1010/）
const P = PROJECT_NAMING.storage_prefix;
export const STORAGE_KEYS = {
  MEMBERS: P + 'duty_members',
  ROSTER_SLOTS: P + 'duty_roster_slots',
  RULES: P + 'duty_rules',
  DUTY_BALANCE: P + 'duty_balance',
  FAIRNESS_SETTINGS: P + 'duty_fairness_settings',
  KEYS: P + 'duty_keys',
  LENDINGS: P + 'duty_lendings',
  LENDING_ITEMS: P + 'duty_lending_items',
  APP_VERSIONS: P + 'duty_app_versions',
  EXTERNAL_LINKS: P + 'duty_external_links',
  TEMP_DUTY: P + 'temp_duty_override',
  KEY_ITEM_HISTORY: P + 'key_item_history',
  SAME_DAY_PAIRS: P + 'duty_same_day_pairs',
} as const;

/** 同天搭檔預設：19&25、12&13、09&10 須排同一天 */
export const DEFAULT_SAME_DAY_PAIRS: [string, string][] = [['19', '25'], ['12', '13'], ['09', '10']];

/**
 * 常順預設「每週不可排」規則（對應 排班條件設定 的 FORBIDDEN_DAYS）。
 * 僅在「套用預設規則」時寫入；若該成員該 weekday 已有任一 weekly 規則則跳過。
 * 格式：{ member_id, weekday }，weekday 0=日、1=一、…、6=六；slot_code 固定為 'any'。
 */
export const DEFAULT_AVAILABILITY_RULES: { member_id: string; weekday: number }[] = [
  { member_id: '01', weekday: 0 },  // 以蓁 不能排週日
  { member_id: '01', weekday: 1 },  // 以蓁 不能排週一
  { member_id: '01', weekday: 2 },  // 以蓁 不能排週二
  { member_id: '01', weekday: 3 },  // 以蓁 不能排週三
  { member_id: '01', weekday: 5 },  // 以蓁 不能排週五
  { member_id: '01', weekday: 6 },  // 以蓁 不能排週六
  { member_id: '06', weekday: 5 },  // 秋屏 不能排週五
  { member_id: '07', weekday: 5 },  // 林鋒 不能排週五
  { member_id: '08', weekday: 2 },  // 秀華 不能排週二
  { member_id: '09', weekday: 1 },  // 盈橙 不能排週一
  { member_id: '09', weekday: 4 },  // 盈橙 不能排週四
  { member_id: '10', weekday: 1 },  // 大同 不能排週一
  { member_id: '10', weekday: 4 },  // 大同 不能排週四
  { member_id: '12', weekday: 1 },  // 雅婷 不能排週一
  { member_id: '12', weekday: 4 },  // 雅婷 不能排週四
  { member_id: '12', weekday: 5 },  // 雅婷 不能排週五
  { member_id: '13', weekday: 1 },  // 瑀嬅 不能排週一
  { member_id: '13', weekday: 4 },  // 瑀嬅 不能排週四
  { member_id: '13', weekday: 5 },  // 瑀嬅 不能排週五
  { member_id: '18', weekday: 2 },  // 志桓 不能排週二
  { member_id: '19', weekday: 1 },  // 子菲 不能排週一
  { member_id: '19', weekday: 4 },  // 子菲 不能排週四
  { member_id: '23', weekday: 5 },  // 珈瑜 不能排週五
  { member_id: '25', weekday: 1 },  // 濬瑒 不能排週一
  { member_id: '25', weekday: 4 },  // 濬瑒 不能排週四
];

/**
 * 特殊「全員不排班」區間：此區間內該日期不產生任何班格，自動排班與月曆皆排除。
 * 例：春節 2/13-21 全員休息，2/22 開放。每年若日期不同請新增一筆。
 */
export const SPECIAL_NO_SCHEDULE_RANGES: { start_date: string; end_date: string; label: string }[] = [
  { start_date: '2026-02-13', end_date: '2026-02-21', label: '特殊春節' },
];

// 同業借出：公司品牌選單（與 index.html 對齊）
export const PARTNER_COMPANIES = [
  '中信房屋', '21世紀', '有巢氏', '台灣房屋', '住商不動產', '永慶房屋',
  '信義房屋', '東森房屋', '太平洋不動產', '全國不動產', '美祺不動產',
  '屋主交代取回', '台慶房屋', '其它',
] as const;
