-- 手動同期リクエストテーブル
-- Supabase SQL Editor で実行してください

CREATE TABLE sync_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE sync_requests ENABLE ROW LEVEL SECURITY;

-- Web UIからの挿入・読み取りを許可
CREATE POLICY "Allow anonymous insert sync_requests" ON sync_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read sync_requests" ON sync_requests
  FOR SELECT USING (true);

-- スクレイパーからの全操作を許可
CREATE POLICY "Allow service role full access on sync_requests" ON sync_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Realtime有効化
ALTER PUBLICATION supabase_realtime ADD TABLE sync_requests;

-- icloud ソースを追加（既存の enum に追加）
-- エラーが出る場合はスキップしてOK（テキスト型のカラムなので影響なし）
DO $$
BEGIN
  ALTER TYPE appointment_source ADD VALUE IF NOT EXISTS 'icloud';
EXCEPTION WHEN others THEN
  NULL;
END $$;
