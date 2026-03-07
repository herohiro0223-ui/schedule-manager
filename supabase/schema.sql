-- 統合スケジュール管理ツール - データベーススキーマ
-- Supabase SQL Editor で実行してください

-- ソースの列挙型
CREATE TYPE appointment_source AS ENUM ('harilabo', 'sekkotwin', 'personal');

-- ステータスの列挙型
CREATE TYPE appointment_status AS ENUM ('confirmed', 'tentative', 'cancelled', 'completed');

-- 予約テーブル
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source appointment_source NOT NULL,
  external_id TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  title TEXT NOT NULL,
  customer_name TEXT,
  staff_name TEXT,
  service_types TEXT[] DEFAULT '{}',
  appointment_type TEXT,
  status appointment_status DEFAULT 'confirmed',
  color TEXT,
  notes TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ソース+外部IDでユニーク制約（重複防止）
  UNIQUE(source, external_id)
);

-- 同期ログテーブル
CREATE TABLE sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source appointment_source NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT
);

-- インデックス
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_source ON appointments(source);
CREATE INDEX idx_appointments_source_date ON appointments(source, date);
CREATE INDEX idx_sync_logs_source ON sync_logs(source);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS（Row Level Security）を有効化
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- anon キーでの読み取りを許可（PWAからの読み取り用）
CREATE POLICY "Allow anonymous read access" ON appointments
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read sync_logs" ON sync_logs
  FOR SELECT USING (true);

-- service_role キーでの全操作を許可（スクレイパーからの書き込み用）
CREATE POLICY "Allow service role full access" ON appointments
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access on sync_logs" ON sync_logs
  FOR ALL USING (auth.role() = 'service_role');

-- タスクテーブル
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_date ON tasks(date);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read tasks" ON tasks
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert tasks" ON tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update tasks" ON tasks
  FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete tasks" ON tasks
  FOR DELETE USING (true);

-- 通知テーブル
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source appointment_source NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  title TEXT NOT NULL,
  customer_name TEXT,
  staff_name TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- anon: SELECT + UPDATE（既読化）のみ
CREATE POLICY "Allow anonymous read notifications" ON notifications
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous update notifications" ON notifications
  FOR UPDATE USING (true);

-- service_role: ALL
CREATE POLICY "Allow service role full access on notifications" ON notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Realtime有効化（Supabase DashboardでRealtimeを有効にする必要あり）
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 手動同期リクエストテーブル
CREATE TABLE sync_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE sync_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert sync_requests" ON sync_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read sync_requests" ON sync_requests
  FOR SELECT USING (true);

CREATE POLICY "Allow service role full access on sync_requests" ON sync_requests
  FOR ALL USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE sync_requests;

-- 便利なビュー：今日の予定
CREATE VIEW today_appointments AS
SELECT * FROM appointments
WHERE date = CURRENT_DATE
ORDER BY start_time ASC;

-- 便利なビュー：最新の同期状態
CREATE VIEW latest_sync AS
SELECT DISTINCT ON (source)
  source,
  started_at,
  completed_at,
  status,
  records_synced,
  error_message
FROM sync_logs
ORDER BY source, started_at DESC;
