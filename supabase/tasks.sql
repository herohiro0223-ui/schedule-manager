-- タスクテーブル作成
-- Supabase Dashboard > SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);

-- updated_at 自動更新（update_updated_at関数が既に存在する前提）
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read tasks" ON tasks
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert tasks" ON tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update tasks" ON tasks
  FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete tasks" ON tasks
  FOR DELETE USING (true);
