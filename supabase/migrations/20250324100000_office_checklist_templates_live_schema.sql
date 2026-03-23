-- Office checklist templates: extend live public.checklist_templates (does not recreate table).
-- Safe for non-empty DB: ADD COLUMN IF NOT EXISTS, idempotent policies, conditional seed.
-- Requires: public.offices(id), public.checklist_template_sections, public.checklist_template_items,
--           public.user_profiles (for RLS). Live checklist_templates must include is_active.

-- ---------------------------------------------------------------------------
-- 1) Columns (only add if missing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.offices (id) ON DELETE CASCADE;

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS is_default_for_type boolean NOT NULL DEFAULT false;

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.checklist_templates (id) ON DELETE SET NULL;

ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS created_from text NOT NULL DEFAULT 'manual';

-- ---------------------------------------------------------------------------
-- 2) Backfills
-- ---------------------------------------------------------------------------
UPDATE public.checklist_templates
SET checklist_type = 'Other'
WHERE checklist_type IS NULL OR trim(checklist_type) = '';

-- archived_at from is_active: inactive → timestamp; active → leave null
UPDATE public.checklist_templates
SET archived_at = COALESCE(updated_at, created_at, now())
WHERE COALESCE(is_active, true) = false
  AND archived_at IS NULL;

UPDATE public.checklist_templates
SET archived_at = NULL
WHERE COALESCE(is_active, true) = true;

-- Do not mass-set created_from here: all rows start with office_id NULL; legacy templates
-- stay created_from = 'manual' until you mark true BTQ starters (UPDATE ... created_from = 'btq_starter').
-- Clone + seed only treat created_from = 'btq_starter' as BTQ starters.

-- ---------------------------------------------------------------------------
-- 3) CHECK constraint on created_from (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checklist_templates_created_from_check'
      AND conrelid = 'public.checklist_templates'::regclass
  ) THEN
    ALTER TABLE public.checklist_templates
      ADD CONSTRAINT checklist_templates_created_from_check
      CHECK (created_from IN ('btq_starter', 'duplicate', 'manual'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_checklist_templates_office_archived
  ON public.checklist_templates (office_id, archived_at)
  WHERE office_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_office_type_active
  ON public.checklist_templates (office_id, checklist_type)
  WHERE office_id IS NOT NULL AND archived_at IS NULL;

DROP INDEX IF EXISTS public.idx_checklist_templates_one_default_per_office_type;

CREATE UNIQUE INDEX idx_checklist_templates_one_default_per_office_type
  ON public.checklist_templates (office_id, checklist_type)
  WHERE office_id IS NOT NULL
    AND archived_at IS NULL
    AND is_default_for_type = true;

-- ---------------------------------------------------------------------------
-- 5) Conditional BTQ seed (only when no active BTQ starters exist)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
  tid_purchase uuid;
  tid_listing uuid;
  tid_lease uuid;
  tid_other uuid;
  sid uuid;
  ts_now timestamptz := now();
BEGIN
  SELECT count(*)::int INTO n
  FROM public.checklist_templates
  WHERE office_id IS NULL
    AND archived_at IS NULL
    AND created_from = 'btq_starter';

  IF n > 0 THEN
    RETURN;
  END IF;

  tid_purchase := gen_random_uuid();
  tid_listing := gen_random_uuid();
  tid_lease := gen_random_uuid();
  tid_other := gen_random_uuid();

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
  ) VALUES
    (tid_purchase, 'BTQ Purchase', 'BTQ starter template', NULL, NULL, 'Purchase', true, NULL, ts_now, ts_now, true, 'btq_starter'),
    (tid_listing, 'BTQ Listing', 'BTQ starter template', NULL, NULL, 'Listing', true, NULL, ts_now, ts_now, true, 'btq_starter'),
    (tid_lease, 'BTQ Lease', 'BTQ starter template', NULL, NULL, 'Lease', true, NULL, ts_now, ts_now, true, 'btq_starter'),
    (tid_other, 'BTQ Other', 'BTQ starter template', NULL, NULL, 'Other', true, NULL, ts_now, ts_now, true, 'btq_starter');

  sid := gen_random_uuid();
  INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
  VALUES (sid, tid_purchase, 'General', 0);
  INSERT INTO public.checklist_template_items (
    id, template_id, section_id, name, requirement, sort_order, is_compliance_document
  ) VALUES (
    gen_random_uuid(), tid_purchase, sid, 'Starter item', 'required', 0, true
  );

  sid := gen_random_uuid();
  INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
  VALUES (sid, tid_listing, 'General', 0);
  INSERT INTO public.checklist_template_items (
    id, template_id, section_id, name, requirement, sort_order, is_compliance_document
  ) VALUES (
    gen_random_uuid(), tid_listing, sid, 'Starter item', 'required', 0, true
  );

  sid := gen_random_uuid();
  INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
  VALUES (sid, tid_lease, 'General', 0);
  INSERT INTO public.checklist_template_items (
    id, template_id, section_id, name, requirement, sort_order, is_compliance_document
  ) VALUES (
    gen_random_uuid(), tid_lease, sid, 'Starter item', 'required', 0, true
  );

  sid := gen_random_uuid();
  INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
  VALUES (sid, tid_other, 'General', 0);
  INSERT INTO public.checklist_template_items (
    id, template_id, section_id, name, requirement, sort_order, is_compliance_document
  ) VALUES (
    gen_random_uuid(), tid_other, sid, 'Starter item', 'required', 0, true
  );
END $$;

-- ---------------------------------------------------------------------------
-- 6) Clone BTQ → office (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clone_btq_templates_to_office (p_office_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src_count int;
  t record;
  old_sec record;
  old_item record;
  new_template_id uuid;
  new_sec_id uuid;
BEGIN
  SELECT count(*)::int INTO src_count
  FROM public.checklist_templates
  WHERE office_id IS NULL
    AND archived_at IS NULL
    AND created_from = 'btq_starter';

  IF src_count = 0 THEN
    RAISE EXCEPTION 'No BTQ starter templates to clone (need rows with office_id IS NULL, archived_at IS NULL, created_from = btq_starter).';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _clone_section_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR t IN
    SELECT *
    FROM public.checklist_templates
    WHERE office_id IS NULL
      AND archived_at IS NULL
      AND created_from = 'btq_starter'
    ORDER BY created_at ASC, id ASC
  LOOP
    TRUNCATE _clone_section_map;

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
      t.is_default_for_type,
      t.id,
      now(),
      now(),
      true,
      'btq_starter'
    );

    FOR old_sec IN
      SELECT *
      FROM public.checklist_template_sections
      WHERE template_id = t.id
      ORDER BY sort_order ASC NULLS LAST, id ASC
    LOOP
      new_sec_id := gen_random_uuid();
      INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
      VALUES (new_sec_id, new_template_id, old_sec.name, old_sec.sort_order);
      INSERT INTO _clone_section_map (old_id, new_id) VALUES (old_sec.id, new_sec_id);
    END LOOP;

    FOR old_item IN
      SELECT *
      FROM public.checklist_template_items
      WHERE template_id = t.id
      ORDER BY sort_order ASC NULLS LAST, id ASC
    LOOP
      new_sec_id := NULL;
      IF old_item.section_id IS NOT NULL THEN
        SELECT m.new_id INTO new_sec_id
        FROM _clone_section_map m
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
        gen_random_uuid(),
        new_template_id,
        new_sec_id,
        old_item.name,
        old_item.requirement,
        old_item.sort_order,
        COALESCE(old_item.is_compliance_document, true)
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Set default template for office + type (atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_default_office_checklist_template (p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office uuid;
  v_type text;
BEGIN
  SELECT office_id, checklist_type INTO v_office, v_type
  FROM public.checklist_templates
  WHERE id = p_template_id;

  IF v_office IS NULL THEN
    RAISE EXCEPTION 'Cannot set default on BTQ/global template';
  END IF;

  IF v_type IS NULL OR trim(v_type) = '' THEN
    RAISE EXCEPTION 'Template has no checklist_type';
  END IF;

  UPDATE public.checklist_templates
  SET is_default_for_type = false
  WHERE office_id = v_office
    AND checklist_type = v_type
    AND archived_at IS NULL;

  UPDATE public.checklist_templates
  SET is_default_for_type = true
  WHERE id = p_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_office_checklist_template (uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Trigger: new office → clone BTQ templates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_offices_clone_checklist_templates ()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.clone_btq_templates_to_office (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offices_after_insert_clone_checklists ON public.offices;

CREATE TRIGGER offices_after_insert_clone_checklists
  AFTER INSERT ON public.offices
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_offices_clone_checklist_templates ();

-- ---------------------------------------------------------------------------
-- 9) RLS (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_templates_select_same_office" ON public.checklist_templates;
CREATE POLICY "checklist_templates_select_same_office"
  ON public.checklist_templates
  FOR SELECT
  TO authenticated
  USING (
    office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid ()
        AND up.office_id IS NOT NULL
        AND up.office_id = checklist_templates.office_id
    )
  );

DROP POLICY IF EXISTS "checklist_templates_insert_broker_admin" ON public.checklist_templates;
CREATE POLICY "checklist_templates_insert_broker_admin"
  ON public.checklist_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid ()
        AND up.office_id = checklist_templates.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
    )
  );

DROP POLICY IF EXISTS "checklist_templates_update_broker_admin" ON public.checklist_templates;
CREATE POLICY "checklist_templates_update_broker_admin"
  ON public.checklist_templates
  FOR UPDATE
  TO authenticated
  USING (
    office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid ()
        AND up.office_id = checklist_templates.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
    )
  )
  WITH CHECK (
    office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid ()
        AND up.office_id = checklist_templates.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
    )
  );

DROP POLICY IF EXISTS "checklist_templates_delete_broker_admin" ON public.checklist_templates;
CREATE POLICY "checklist_templates_delete_broker_admin"
  ON public.checklist_templates
  FOR DELETE
  TO authenticated
  USING (
    office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid ()
        AND up.office_id = checklist_templates.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
    )
  );

ALTER TABLE public.checklist_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_template_sections_select_office" ON public.checklist_template_sections;
CREATE POLICY "checklist_template_sections_select_office"
  ON public.checklist_template_sections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id IS NOT NULL
        AND up.office_id = t.office_id
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_sections_insert_broker_admin" ON public.checklist_template_sections;
CREATE POLICY "checklist_template_sections_insert_broker_admin"
  ON public.checklist_template_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_sections_update_broker_admin" ON public.checklist_template_sections;
CREATE POLICY "checklist_template_sections_update_broker_admin"
  ON public.checklist_template_sections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_sections_delete_broker_admin" ON public.checklist_template_sections;
CREATE POLICY "checklist_template_sections_delete_broker_admin"
  ON public.checklist_template_sections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_select_office" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_select_office"
  ON public.checklist_template_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id IS NOT NULL
        AND up.office_id = t.office_id
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_insert_broker_admin" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_insert_broker_admin"
  ON public.checklist_template_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_update_broker_admin" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_update_broker_admin"
  ON public.checklist_template_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_delete_broker_admin" ON public.checklist_template_items;
CREATE POLICY "checklist_template_items_delete_broker_admin"
  ON public.checklist_template_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      JOIN public.user_profiles up ON up.id = auth.uid ()
        AND up.office_id = t.office_id
        AND lower(trim(up.role)) IN ('broker', 'admin')
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NOT NULL
    )
  );
