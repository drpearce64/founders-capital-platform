-- Invoice upload columns migration
-- Run once against Supabase to add file-upload support to the invoices table

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS jurisdiction        TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source             TEXT DEFAULT 'manual';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_filename  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachment_url     TEXT;

-- Ensure has_attachment exists (may already be present)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_attachment     BOOLEAN DEFAULT false;
