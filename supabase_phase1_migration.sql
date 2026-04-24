-- =============================================================================
-- FOUNDERS CAPITAL — PHASE 1 MIGRATION
-- Adds: audit_log, fee columns on capital_call_items,
--       receipt tracking on capital_call_items,
--       distributions table enhancements
-- Run this in Supabase SQL Editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. AUDIT LOG TABLE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name   TEXT NOT NULL,
  record_id    UUID,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'issue', 'mark_received', 'chase_sent')),
  actor        TEXT NOT NULL DEFAULT 'admin',
  description  TEXT,
  old_values   JSONB,
  new_values   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. FEE AMOUNT ON CAPITAL CALL ITEMS
-- ---------------------------------------------------------------------------
ALTER TABLE capital_call_items
  ADD COLUMN IF NOT EXISTS fee_amount       NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate         NUMERIC(6,4)  NOT NULL DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS net_call_amount  NUMERIC(18,6) GENERATED ALWAYS AS (call_amount + fee_amount) STORED;

-- ---------------------------------------------------------------------------
-- 3. RECEIPT TRACKING ON CAPITAL CALL ITEMS
-- ---------------------------------------------------------------------------
ALTER TABLE capital_call_items
  ADD COLUMN IF NOT EXISTS received_amount  NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_date    DATE,
  ADD COLUMN IF NOT EXISTS bank_reference   TEXT,
  ADD COLUMN IF NOT EXISTS days_overdue     INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN status = 'funded' THEN 0
      WHEN funded_amount >= call_amount THEN 0
      ELSE NULL  -- computed in application layer using due_date
    END
  ) STORED;

-- ---------------------------------------------------------------------------
-- 4. DISTRIBUTIONS TABLE — ensure waterfall columns exist
-- ---------------------------------------------------------------------------
ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS total_proceeds        NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS return_of_capital     NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS preferred_return      NUMERIC(18,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carried_interest      NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS net_to_lps            NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS carry_rate            NUMERIC(6,4)  DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS waterfall_notes       TEXT,
  ADD COLUMN IF NOT EXISTS status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid'));

ALTER TABLE distribution_items
  ADD COLUMN IF NOT EXISTS return_of_capital     NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS carry_withheld        NUMERIC(18,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_distribution      NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS ownership_pct         NUMERIC(8,6);

-- ---------------------------------------------------------------------------
-- 5. CHASE LOG on capital_call_items
-- ---------------------------------------------------------------------------
ALTER TABLE capital_call_items
  ADD COLUMN IF NOT EXISTS last_chase_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chase_count     INTEGER NOT NULL DEFAULT 0;
