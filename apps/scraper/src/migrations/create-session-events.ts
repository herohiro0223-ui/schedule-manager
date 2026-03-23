/**
 * session_events テーブル作成マイグレーション
 *
 * Supabase Dashboard の SQL Editor で以下のSQLを実行してください:
 *
 * CREATE TABLE IF NOT EXISTS session_events (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   service TEXT NOT NULL DEFAULT 'salonboard',
 *   event_type TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   session_age_hours NUMERIC,
 *   sync_attempt_count INTEGER DEFAULT 0,
 *   error_message TEXT,
 *   metadata JSONB DEFAULT '{}'::jsonb
 * );
 * CREATE INDEX IF NOT EXISTS idx_session_events_service ON session_events(service);
 * CREATE INDEX IF NOT EXISTS idx_session_events_created_at ON session_events(created_at DESC);
 * CREATE INDEX IF NOT EXISTS idx_session_events_event_type ON session_events(event_type);
 * ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Service role full access" ON session_events FOR ALL USING (true) WITH CHECK (true);
 *
 * または、このスクリプトを実行:
 *   cd apps/scraper && npx tsx src/migrations/create-session-events.ts
 */

import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

async function main() {
  // テーブルの存在確認
  const { error: testError } = await supabase
    .from('session_events')
    .select('id')
    .limit(1);

  if (!testError) {
    console.log('✅ session_events テーブルは既に存在します');
    return;
  }

  console.log('❌ session_events テーブルが存在しません');
  console.log('Supabase Dashboard の SQL Editor で以下を実行してください:\n');
  console.log(`
CREATE TABLE IF NOT EXISTS session_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL DEFAULT 'salonboard',
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_age_hours NUMERIC,
  sync_attempt_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_session_events_service ON session_events(service);
CREATE INDEX IF NOT EXISTS idx_session_events_created_at ON session_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_event_type ON session_events(event_type);

ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON session_events FOR ALL USING (true) WITH CHECK (true);
  `.trim());
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
