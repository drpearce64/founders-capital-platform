-- =============================================================================
-- FOUNDERS CAPITAL — STATUTORY FILINGS TRACKER MIGRATION
-- Creates: statutory_filings table
-- Run this in Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS statutory_filings (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id         UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  seq_no            INTEGER,                          -- filing number within entity
  filing_name       TEXT        NOT NULL,             -- "Annual Return & annual fee"
  authority         TEXT,                             -- "Registrar of Exempted LPs"
  frequency         TEXT,                             -- "Annual", "Ongoing", etc.
  applies_to        TEXT,                             -- "FY2025", "Calendar year", etc.
  statutory_due     DATE,                             -- Statutory Due Date
  internal_target   DATE,                             -- Internal Target date
  status            TEXT        NOT NULL DEFAULT 'Not Started'
                    CHECK (status IN (
                      'Not Started',
                      'In Progress',
                      'Filed / Complete',
                      'Not Applicable',
                      'Overdue'
                    )),
  date_completed    DATE,
  owner             TEXT,                             -- "Registered office / corp services"
  adviser           TEXT,                             -- "CIMA-approved auditor"
  reference_no      TEXT,
  evidence_link     TEXT,                             -- Drive link / File ID
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for upsert on (entity_id, seq_no, filing_name)
ALTER TABLE statutory_filings
  DROP CONSTRAINT IF EXISTS uq_statutory_filings_entity_seq_name;
ALTER TABLE statutory_filings
  ADD CONSTRAINT uq_statutory_filings_entity_seq_name
  UNIQUE (entity_id, seq_no, filing_name);

-- Index for fast lookup by entity
CREATE INDEX IF NOT EXISTS idx_statutory_filings_entity_id
  ON statutory_filings (entity_id);

-- Index for upcoming due date queries
CREATE INDEX IF NOT EXISTS idx_statutory_filings_due
  ON statutory_filings (statutory_due)
  WHERE statutory_due IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_statutory_filings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_statutory_filings_updated_at ON statutory_filings;
CREATE TRIGGER trg_statutory_filings_updated_at
  BEFORE UPDATE ON statutory_filings
  FOR EACH ROW EXECUTE FUNCTION update_statutory_filings_updated_at();
