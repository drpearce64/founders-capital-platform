-- =============================================================================
-- FOUNDERS CAPITAL — AIRTABLE SYNC MIGRATION
-- Adds airtable tracking columns + sync log table
-- Run once in Supabase SQL Editor before the first sync
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add airtable_id to investors (Members link)
-- ---------------------------------------------------------------------------
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS airtable_id TEXT UNIQUE;

-- ---------------------------------------------------------------------------
-- 2. Add airtable_deal_id to entities + investments (Deals link)
-- ---------------------------------------------------------------------------
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS airtable_deal_id TEXT UNIQUE;

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS airtable_deal_id TEXT UNIQUE;

-- ---------------------------------------------------------------------------
-- 3. Add airtable_id to investor_commitments (Commitments link)
-- ---------------------------------------------------------------------------
ALTER TABLE investor_commitments
  ADD COLUMN IF NOT EXISTS airtable_id TEXT UNIQUE;

-- ---------------------------------------------------------------------------
-- 4. Sync log table — one row per record touched per sync run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airtable_sync_log (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  table_name           TEXT        NOT NULL,
  airtable_record_id   TEXT,
  action               TEXT        NOT NULL,   -- upsert | skip | sync_complete
  status               TEXT        NOT NULL,   -- ok | warning | error
  detail               TEXT
);

-- Index for fast recent-run queries
CREATE INDEX IF NOT EXISTS idx_airtable_sync_log_synced_at
  ON airtable_sync_log (synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_airtable_sync_log_status
  ON airtable_sync_log (status);

-- ---------------------------------------------------------------------------
-- 5. Extend investor_commitments if fee_rate / carry_rate columns missing
--    (may already exist from Phase 1 — ADD COLUMN IF NOT EXISTS is safe)
-- ---------------------------------------------------------------------------
ALTER TABLE investor_commitments
  ADD COLUMN IF NOT EXISTS fee_rate    NUMERIC(6,4) DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS carry_rate  NUMERIC(6,4) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS currency    TEXT         DEFAULT 'USD';
