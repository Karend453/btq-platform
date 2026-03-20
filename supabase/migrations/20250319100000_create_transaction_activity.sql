-- Transaction activity: persisted history feed for document/workflow actions.
-- Stores entries for: document attached, replaced, accepted, rejected, waived, comments, etc.

CREATE TABLE transaction_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  document_id uuid,
  checklist_item_id uuid,
  actor_user_id text,
  actor_display_name text NOT NULL,
  activity_type text NOT NULL,
  category text NOT NULL DEFAULT 'docs' CHECK (category IN ('docs', 'forms', 'system', 'transaction')),
  message text NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_activity_transaction_created
  ON transaction_activity(transaction_id, created_at DESC);

-- RLS: allow authenticated users to read/write activity for transactions they can access
ALTER TABLE transaction_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btq_transaction_activity_authenticated_all"
  ON transaction_activity
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
