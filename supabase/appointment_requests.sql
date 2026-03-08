-- 予約リクエスト管理テーブル
-- LINE/Messenger/Gmail等からの予約リクエストを記録し、SALON BOARDとの突き合わせを行う

-- チャンネルの列挙型
CREATE TYPE request_channel AS ENUM ('line', 'messenger', 'gmail', 'phone', 'other');

-- リクエストステータスの列挙型
CREATE TYPE request_status AS ENUM ('pending', 'registered', 'cancelled');

-- 予約リクエストテーブル
CREATE TABLE appointment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  source_channel request_channel NOT NULL DEFAULT 'other',
  status request_status NOT NULL DEFAULT 'pending',
  matched_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  message_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_appointment_requests_date ON appointment_requests(date);
CREATE INDEX idx_appointment_requests_status ON appointment_requests(status);
CREATE INDEX idx_appointment_requests_date_status ON appointment_requests(date, status);

-- updated_at自動更新トリガー
CREATE TRIGGER appointment_requests_updated_at
  BEFORE UPDATE ON appointment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;

-- anon: SELECT, INSERT, UPDATE, DELETE（PWAから操作）
CREATE POLICY "Allow anonymous read appointment_requests" ON appointment_requests
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert appointment_requests" ON appointment_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update appointment_requests" ON appointment_requests
  FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete appointment_requests" ON appointment_requests
  FOR DELETE USING (true);

-- service_role: ALL（スクレイパーからの自動突き合わせ用）
CREATE POLICY "Allow service role full access on appointment_requests" ON appointment_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Realtime有効化
ALTER PUBLICATION supabase_realtime ADD TABLE appointment_requests;
