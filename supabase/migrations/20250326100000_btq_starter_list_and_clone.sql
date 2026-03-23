-- List global BTQ starters for settings dropdown; clone one starter into an office-owned template.
-- SECURITY DEFINER: BTQ rows (office_id IS NULL) are not visible under normal RLS.

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
    AND t.created_from = 'btq_starter'
  ORDER BY t.checklist_type ASC, t.name ASC, t.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_btq_checklist_starters () TO authenticated;

CREATE OR REPLACE FUNCTION public.clone_btq_starter_to_office (
  p_office_id uuid,
  p_btq_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.checklist_templates%ROWTYPE;
  old_sec record;
  old_item record;
  new_template_id uuid;
  new_sec_id uuid;
BEGIN
  IF p_office_id IS NULL OR p_btq_template_id IS NULL THEN
    RAISE EXCEPTION 'p_office_id and p_btq_template_id are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid ()
      AND up.office_id IS NOT NULL
      AND up.office_id = p_office_id
      AND lower(trim(up.role)) IN ('broker', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage checklist templates for this office';
  END IF;

  SELECT * INTO t
  FROM public.checklist_templates
  WHERE id = p_btq_template_id
    AND office_id IS NULL
    AND archived_at IS NULL
    AND created_from = 'btq_starter';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BTQ starter template not found or invalid';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _clone_btq_single_section_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _clone_btq_single_section_map;

  new_template_id := gen_random_uuid ();

  INSERT INTO public.checklist_templates (
    id,
    name,
    description,
    office_id,
    archived_at,
    checklist_type,
    is_default_for_type,
    source_template_id,
    created_at,
    updated_at,
    is_active,
    created_from
  ) VALUES (
    new_template_id,
    t.name,
    t.description,
    p_office_id,
    NULL,
    t.checklist_type,
    false,
    t.id,
    now(),
    now(),
    true,
    'btq_starter'
  );

  FOR old_sec IN
    SELECT *
    FROM public.checklist_template_sections
    WHERE template_id = p_btq_template_id
    ORDER BY sort_order ASC NULLS LAST, id ASC
  LOOP
    new_sec_id := gen_random_uuid ();
    INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
    VALUES (new_sec_id, new_template_id, old_sec.name, old_sec.sort_order);
    INSERT INTO _clone_btq_single_section_map (old_id, new_id) VALUES (old_sec.id, new_sec_id);
  END LOOP;

  FOR old_item IN
    SELECT *
    FROM public.checklist_template_items
    WHERE template_id = p_btq_template_id
    ORDER BY sort_order ASC NULLS LAST, id ASC
  LOOP
    new_sec_id := NULL;
    IF old_item.section_id IS NOT NULL THEN
      SELECT m.new_id INTO new_sec_id
      FROM _clone_btq_single_section_map m
      WHERE m.old_id = old_item.section_id;
    END IF;

    INSERT INTO public.checklist_template_items (
      id,
      template_id,
      section_id,
      name,
      requirement,
      sort_order,
      is_compliance_document
    ) VALUES (
      gen_random_uuid (),
      new_template_id,
      new_sec_id,
      old_item.name,
      old_item.requirement,
      old_item.sort_order,
      COALESCE(old_item.is_compliance_document, true)
    );
  END LOOP;

  RETURN new_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_btq_starter_to_office (uuid, uuid) TO authenticated;
