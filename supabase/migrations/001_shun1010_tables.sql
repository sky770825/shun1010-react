-- 常順班表 app_shun1010 — Supabase 資料表
-- 在 Supabase Dashboard > SQL Editor 貼上執行

-- 1. 成員
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  exclude_roster BOOLEAN NOT NULL DEFAULT false,
  role TEXT NOT NULL DEFAULT 'member',
  max_shifts_per_day INT NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 可排班規則
CREATE TABLE IF NOT EXISTS availability_rules (
  rule_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'blocked',
  weekday INT,
  date TEXT,
  start_date TEXT,
  end_date TEXT,
  slot_code TEXT NOT NULL DEFAULT 'any',
  reason TEXT NOT NULL DEFAULT '',
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 排班格
CREATE TABLE IF NOT EXISTS roster_slots (
  date TEXT NOT NULL,
  slot_code TEXT NOT NULL,
  assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  original_assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, slot_code)
);

-- 4. 公平性累計
CREATE TABLE IF NOT EXISTS duty_balance (
  month TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  assigned_WD_AM INT NOT NULL DEFAULT 0,
  assigned_WD_PM INT NOT NULL DEFAULT 0,
  assigned_WE_AM INT NOT NULL DEFAULT 0,
  assigned_WE_MD INT NOT NULL DEFAULT 0,
  assigned_WE_PM INT NOT NULL DEFAULT 0,
  carry_WD_AM NUMERIC NOT NULL DEFAULT 0,
  carry_WD_PM NUMERIC NOT NULL DEFAULT 0,
  carry_WE_AM NUMERIC NOT NULL DEFAULT 0,
  carry_WE_MD NUMERIC NOT NULL DEFAULT 0,
  carry_WE_PM NUMERIC NOT NULL DEFAULT 0,
  assigned_total INT NOT NULL DEFAULT 0,
  carry_total NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, member_id)
);

-- 5. 公平設定（單筆，id=1）
CREATE TABLE IF NOT EXISTS fairness_settings (
  id INT PRIMARY KEY DEFAULT 1,
  slot_weights JSONB NOT NULL DEFAULT '{"WD_AM":1,"WD_PM":1.1,"WE_AM":1.1,"WE_MD":1.2,"WE_PM":1.4}',
  carry_months INT NOT NULL DEFAULT 2,
  carry_strength NUMERIC NOT NULL DEFAULT 1.0,
  max_shifts_per_day INT NOT NULL DEFAULT 1,
  no_close_to_open BOOLEAN NOT NULL DEFAULT true,
  enable_auto_swap BOOLEAN NOT NULL DEFAULT true,
  max_retries INT NOT NULL DEFAULT 30,
  allow_soften_close_to_open BOOLEAN NOT NULL DEFAULT false,
  allow_two_shifts_per_day BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO fairness_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. 同天搭檔 [["19","25"],["12","13"],...]
CREATE TABLE IF NOT EXISTS same_day_pairs (
  id SERIAL PRIMARY KEY,
  member_a TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_b TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE
);

-- 7. 鑰匙
CREATE TABLE IF NOT EXISTS keys (
  key_id TEXT PRIMARY KEY,
  key_name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 借出主檔
CREATE TABLE IF NOT EXISTS lendings (
  lending_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  borrower_type TEXT NOT NULL,
  borrower_name TEXT NOT NULL,
  borrower_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  partner_company TEXT,
  partner_contact TEXT,
  status TEXT NOT NULL DEFAULT 'out',
  returned_at TIMESTAMPTZ,
  duty_confirmed_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  duty_confirmed_at TIMESTAMPTZ,
  note TEXT
);

-- 9. 借出明細
CREATE TABLE IF NOT EXISTS lending_items (
  id TEXT PRIMARY KEY,
  lending_id TEXT NOT NULL REFERENCES lendings(lending_id) ON DELETE CASCADE,
  key_id TEXT REFERENCES keys(key_id) ON DELETE SET NULL,
  key_name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1
);

-- 10. 版次快照
CREATE TABLE IF NOT EXISTS app_versions (
  version_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  month TEXT NOT NULL,
  roster_snapshot JSONB NOT NULL,
  note TEXT
);

-- 11. 臨時代班 (date, slot_code) -> member_id
CREATE TABLE IF NOT EXISTS temp_duty (
  date TEXT NOT NULL,
  slot_code TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (date, slot_code)
);

-- 12. 常用鑰匙歷史（依 sort_order 小＝新）
CREATE TABLE IF NOT EXISTS key_item_history (
  key_name TEXT PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0
);

-- 13. 外部連結
CREATE TABLE IF NOT EXISTS external_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  description TEXT
);

-- RLS：使用 anon key 時可開放讀寫，或依需求改為 auth.role()
-- 若只給 anon 用，可先全部 ENABLE 並 ALLOW 給 anon
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE fairness_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE same_day_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE lendings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lending_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_duty ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_item_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_links ENABLE ROW LEVEL SECURITY;

-- 允許 anon 完整讀寫（依你專案權限可再縮小）
CREATE POLICY "allow_anon_all_members" ON members FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_availability_rules" ON availability_rules FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_roster_slots" ON roster_slots FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_duty_balance" ON duty_balance FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_fairness_settings" ON fairness_settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_same_day_pairs" ON same_day_pairs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_keys" ON keys FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_lendings" ON lendings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_lending_items" ON lending_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_app_versions" ON app_versions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_temp_duty" ON temp_duty FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_key_item_history" ON key_item_history FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_all_external_links" ON external_links FOR ALL TO anon USING (true) WITH CHECK (true);
