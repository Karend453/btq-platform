-- Add checklist_template_id to transactions as the source of truth for selected checklist.
-- Run this migration if the column does not exist yet.

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS checklist_template_id uuid REFERENCES checklist_templates(id);
