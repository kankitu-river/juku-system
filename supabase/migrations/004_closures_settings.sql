-- 休校日テーブル
CREATE TABLE IF NOT EXISTS school_closures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE school_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users manage closures"
  ON school_closures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- アプリ設定テーブル（時間帯スロットなど）
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users manage settings"
  ON app_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
