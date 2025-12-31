-- =============================================
-- Idempotency keys + device signature traceability
-- =============================================

-- Lightweight idempotency ledger (per route scope)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  status_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON idempotency_keys(created_at);

-- Optional: track client event IDs on attendance rows for auditability
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON attendance(event_id);
