-- ブラウザセッション永続化テーブル
-- Playwright の storageState を Supabase に保存し、Railway からアクセス可能にする

CREATE TABLE browser_sessions (
  service TEXT PRIMARY KEY,
  session_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;

-- service_role のみアクセス可（スクレイパーのみ読み書き）
CREATE POLICY "service_role_only" ON browser_sessions
  FOR ALL USING (auth.role() = 'service_role');
