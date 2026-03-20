-- Checklist item comments: persisted review/document comments per transaction + checklist item.
-- checklist_item_id is a plain reference (no FK) to avoid tight coupling to template changes.

CREATE TABLE checklist_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('Admin', 'Agent')),
  author_name text NOT NULL,
  message text NOT NULL,
  visibility text NOT NULL DEFAULT 'Shared' CHECK (visibility IN ('Internal', 'Shared')),
  type text DEFAULT 'Comment' CHECK (type IN ('Comment', 'StatusChange', 'System')),
  page_number integer,
  location_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unread jsonb DEFAULT '{}'
);

CREATE INDEX idx_checklist_item_comments_lookup
  ON checklist_item_comments(transaction_id, checklist_item_id);
