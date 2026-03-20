-- Transaction-scoped checklist rows (source of truth for status, review, requirement).

CREATE TABLE checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  template_item_id uuid NOT NULL,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  reviewstatus text NOT NULL DEFAULT 'pending',
  reviewnote text,
  UNIQUE (transaction_id, template_item_id)
);

CREATE INDEX idx_checklist_items_transaction_id ON checklist_items (transaction_id);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_items_select_authenticated"
  ON checklist_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "checklist_items_insert_authenticated"
  ON checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "checklist_items_update_authenticated"
  ON checklist_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "checklist_items_delete_authenticated"
  ON checklist_items FOR DELETE
  TO authenticated
  USING (true);
