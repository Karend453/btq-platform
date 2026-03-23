-- Office settings "Add from BTQ starter" dropdown: list only the two canonical global
-- BTQ templates (Purchase + Listing), manual globals — not btq_starter rows.

CREATE OR REPLACE FUNCTION public.list_btq_checklist_starters ()
RETURNS TABLE (
  id uuid,
  name text,
  checklist_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name::text, t.checklist_type::text
  FROM public.checklist_templates t
  WHERE t.office_id IS NULL
    AND t.archived_at IS NULL
    AND t.created_from = 'manual'
    AND t.checklist_type IN ('Purchase', 'Listing')
  ORDER BY t.checklist_type ASC, t.name ASC, t.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_btq_checklist_starters () TO authenticated;
