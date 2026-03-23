CREATE TABLE IF NOT EXISTS detected_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('gmail', 'imessage')),
  message_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('salon_appointment', 'work_meeting', 'other')),
  summary TEXT,
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  raw_text TEXT,
  sender TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added_to_calendar', 'added_to_requests', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, message_id)
);

CREATE OR REPLACE FUNCTION update_detected_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER detected_events_updated_at
  BEFORE UPDATE ON detected_events
  FOR EACH ROW
  EXECUTE FUNCTION update_detected_events_updated_at();

CREATE INDEX IF NOT EXISTS idx_detected_events_status ON detected_events(status);
CREATE INDEX IF NOT EXISTS idx_detected_events_date ON detected_events(date);
CREATE INDEX IF NOT EXISTS idx_detected_events_source_message ON detected_events(source, message_id);

ALTER TABLE detected_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "detected_events_anon_select"
  ON detected_events FOR SELECT
  TO anon USING (true);

CREATE POLICY "detected_events_anon_update"
  ON detected_events FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

CREATE POLICY "detected_events_service_all"
  ON detected_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);
