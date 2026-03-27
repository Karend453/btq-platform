-- Broker checklist RPCs: read user_profiles for authorization after SET row_security = off,
-- so the SECURITY DEFINER session can always evaluate the caller row (avoids flaky RLS ordering).

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
  v_sections_src int;
  v_items_src int;
  v_sections_ins int;
  v_items_ins int;
BEGIN
  IF p_office_id IS NULL OR p_btq_template_id IS NULL THEN
    RAISE EXCEPTION 'p_office_id and p_btq_template_id are required';
  END IF;

  SET LOCAL row_security = off;

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
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BTQ starter template not found or invalid';
  END IF;

  SELECT COUNT(*)::int INTO v_sections_src FROM public.checklist_template_sections WHERE template_id = p_btq_template_id;
  SELECT COUNT(*)::int INTO v_items_src FROM public.checklist_template_items WHERE template_id = p_btq_template_id;

  IF v_sections_src = 0 AND v_items_src = 0 THEN
    RAISE EXCEPTION 'Cannot clone empty global template for checklist type %', t.checklist_type;
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
    p_btq_template_id,
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

  SELECT COUNT(*)::int INTO v_sections_ins FROM public.checklist_template_sections WHERE template_id = new_template_id;
  SELECT COUNT(*)::int INTO v_items_ins FROM public.checklist_template_items WHERE template_id = new_template_id;

  IF v_sections_ins <> v_sections_src OR v_items_ins <> v_items_src THEN
    RAISE EXCEPTION 'Clone verification failed: expected % sections and % items, got % and %',
      v_sections_src, v_items_src, v_sections_ins, v_items_ins;
  END IF;

  RETURN new_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_btq_starter_to_office (uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_office_checklist_template_from_btq (
  p_office_id uuid,
  p_checklist_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_result_id uuid;
  v_has_default boolean;
  t public.checklist_templates%ROWTYPE;
  old_sec record;
  old_item record;
  new_template_id uuid;
  new_sec_id uuid;
  src_id uuid;
BEGIN
  IF p_office_id IS NULL THEN
    RAISE EXCEPTION 'p_office_id is required';
  END IF;

  v_type := trim(coalesce(p_checklist_type, ''));
  IF v_type = '' THEN
    RAISE EXCEPTION 'p_checklist_type is required';
  END IF;

  SET LOCAL row_security = off;

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

  SELECT ct.id INTO v_result_id
  FROM public.checklist_templates ct
  WHERE ct.office_id = p_office_id
    AND ct.checklist_type = v_type
    AND ct.archived_at IS NULL
  ORDER BY ct.is_default_for_type DESC, ct.created_at ASC, ct.id ASC
  LIMIT 1;

  IF v_result_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.checklist_templates x
      WHERE x.office_id = p_office_id
        AND x.checklist_type = v_type
        AND x.archived_at IS NULL
        AND x.is_default_for_type = true
    ) INTO v_has_default;

    IF NOT v_has_default THEN
      PERFORM public.set_default_office_checklist_template (v_result_id);
    END IF;

    RETURN v_result_id;
  END IF;

  SELECT ct.id INTO src_id
  FROM public.checklist_templates ct
  WHERE ct.office_id IS NULL
    AND ct.archived_at IS NULL
    AND ct.checklist_type = v_type
    AND ct.created_from IN ('btq', 'btq_starter')
  ORDER BY (ct.created_from = 'btq') DESC, ct.created_at ASC, ct.id ASC
  LIMIT 1;

  IF src_id IS NULL THEN
    RAISE EXCEPTION 'No BTQ master template for checklist type %', v_type;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ensure_clone_section_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _ensure_clone_section_map;

  SELECT * INTO t
  FROM public.checklist_templates
  WHERE id = src_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BTQ master template not found';
  END IF;

  new_template_id := gen_random_uuid();

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
    WHERE template_id = src_id
    ORDER BY sort_order ASC NULLS LAST, id ASC
  LOOP
    new_sec_id := gen_random_uuid();
    INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
    VALUES (new_sec_id, new_template_id, old_sec.name, old_sec.sort_order);
    INSERT INTO _ensure_clone_section_map (old_id, new_id) VALUES (old_sec.id, new_sec_id);
  END LOOP;

  FOR old_item IN
    SELECT *
    FROM public.checklist_template_items
    WHERE template_id = src_id
    ORDER BY sort_order ASC NULLS LAST, id ASC
  LOOP
    new_sec_id := NULL;
    IF old_item.section_id IS NOT NULL THEN
      SELECT m.new_id INTO new_sec_id
      FROM _ensure_clone_section_map m
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

  PERFORM public.set_default_office_checklist_template (new_template_id);

  RETURN new_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_office_checklist_template_from_btq (uuid, text) TO authenticated;
