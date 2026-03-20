-- checklist_item_comments only: align with insertComment() + authenticated clients.
-- Local mismatch vs production: original CREATE has no RLS; if RLS was enabled without
-- policies, inserts fail. checklist_item_id as uuid rejects non-uuid checklist_items.id strings.

ALTER TABLE public.checklist_item_comments
  ALTER COLUMN checklist_item_id TYPE text USING checklist_item_id::text;

ALTER TABLE public.checklist_item_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_item_comments_authenticated_all" ON public.checklist_item_comments;

CREATE POLICY "checklist_item_comments_authenticated_all"
  ON public.checklist_item_comments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_item_comments TO authenticated;
