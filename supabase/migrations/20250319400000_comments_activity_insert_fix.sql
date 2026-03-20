-- Fix 400s on checklist_item_comments + transaction_activity inserts:
-- 1) checklist_item_id must accept checklist_items.id whether uuid or bigint (PostgREST sends string ids).
-- 2) checklist_item_comments had no RLS policies in repo; if RLS is on, inserts were denied — add authenticated policies.
-- 3) Re-assert transaction_activity policy so INSERT is allowed for authenticated JWTs.

ALTER TABLE public.checklist_item_comments
  ALTER COLUMN checklist_item_id TYPE text USING checklist_item_id::text;

ALTER TABLE public.transaction_activity
  ALTER COLUMN checklist_item_id TYPE text USING checklist_item_id::text;

ALTER TABLE public.checklist_item_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_item_comments_authenticated_all" ON public.checklist_item_comments;

CREATE POLICY "checklist_item_comments_authenticated_all"
  ON public.checklist_item_comments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "btq_transaction_activity_authenticated_all" ON public.transaction_activity;

CREATE POLICY "btq_transaction_activity_authenticated_all"
  ON public.transaction_activity
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
