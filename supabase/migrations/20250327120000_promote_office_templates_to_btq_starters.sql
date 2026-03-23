-- =============================================================================
-- ONE-TIME DATA FIX: Copy full office checklist structure into BTQ starter rows
-- =============================================================================
-- Prerequisites (run in SQL editor first and paste real UUIDs below):
--   SELECT id, name, checklist_type,
--          (SELECT count(*) FROM checklist_template_sections s WHERE s.template_id = t.id) AS sections,
--          (SELECT count(*) FROM checklist_template_items i WHERE i.template_id = t.id) AS items
--   FROM checklist_templates t
--   WHERE t.office_id IS NOT NULL AND t.archived_at IS NULL
--     AND (t.name ILIKE '%NC Listing%' OR t.name ILIKE '%NC Buyer%' OR ...);
--
--   SELECT id, name, checklist_type FROM checklist_templates
--   WHERE office_id IS NULL AND archived_at IS NULL AND created_from = 'btq_starter';
--
-- Rules:
--   - BTQ template ids are NOT changed (same four global rows).
--   - For each checklist_type, source office template must have matching checklist_type.
--   - Replace the four placeholder UUIDs in cfg below, then apply this migration.
--
-- Sentinel: if you forget to edit, migration raises and rolls back.
-- =============================================================================

DO $$
DECLARE
  cfg RECORD;
  v_btq_id uuid;
  v_src_id uuid;
  v_src_type text;
  v_src_office uuid;
  old_sec record;
  old_item record;
  new_sec_id uuid;
  n_btq int;
  v_new_item_section uuid;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _btq_promote_sec_map (
    old_section_id uuid PRIMARY KEY,
    new_section_id uuid NOT NULL
  ) ON COMMIT DROP;

  -- ---------------------------------------------------------------------------
  -- CONFIG: set these four UUIDs to your canonical full office templates
  -- ---------------------------------------------------------------------------
  FOR cfg IN
    SELECT * FROM (
      VALUES
        ('Purchase'::text, '10000000-0000-4000-8000-000000000001'::uuid), -- NC Buyer / Purchase — REPLACE
        ('Listing'::text,  '10000000-0000-4000-8000-000000000002'::uuid), -- NC Listing — REPLACE
        ('Lease'::text,    '10000000-0000-4000-8000-000000000003'::uuid), -- REPLACE
        ('Other'::text,    '10000000-0000-4000-8000-000000000004'::uuid)  -- REPLACE
    ) AS t (checklist_type, source_template_id)
  LOOP
    IF cfg.source_template_id IN (
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000004'::uuid
    ) THEN
      RAISE EXCEPTION
        'promote_btq_starters: Replace the four placeholder UUIDs in the cfg VALUES list with real office template ids before running.';
    END IF;

    -- Exactly one BTQ starter per type
    SELECT id INTO v_btq_id
    FROM public.checklist_templates
    WHERE office_id IS NULL
      AND archived_at IS NULL
      AND created_from = 'btq_starter'
      AND checklist_type = cfg.checklist_type
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF v_btq_id IS NULL THEN
      RAISE EXCEPTION 'promote_btq_starters: No BTQ starter row for checklist_type=%', cfg.checklist_type;
    END IF;

    SELECT count(*)::int INTO n_btq
    FROM public.checklist_templates
    WHERE office_id IS NULL
      AND archived_at IS NULL
      AND created_from = 'btq_starter'
      AND checklist_type = cfg.checklist_type;

    IF n_btq > 1 THEN
      RAISE WARNING 'promote_btq_starters: Multiple BTQ starters for %; using oldest by created_at, id.', cfg.checklist_type;
    END IF;

    -- Source must be office-owned, active, and same checklist_type as row we're filling
    SELECT id, checklist_type, office_id
    INTO v_src_id, v_src_type, v_src_office
    FROM public.checklist_templates
    WHERE id = cfg.source_template_id
      AND office_id IS NOT NULL
      AND archived_at IS NULL;

    IF v_src_id IS NULL THEN
      RAISE EXCEPTION 'promote_btq_starters: Source template % not found or not an active office template.', cfg.source_template_id;
    END IF;

    IF v_src_type IS DISTINCT FROM cfg.checklist_type THEN
      RAISE EXCEPTION
        'promote_btq_starters: Source % (type=%) does not match cfg checklist_type=%.',
        cfg.source_template_id,
        v_src_type,
        cfg.checklist_type;
    END IF;

    -- 1) Remove existing BTQ structure (items first: items may reference sections)
    DELETE FROM public.checklist_template_items
    WHERE template_id = v_btq_id;

    DELETE FROM public.checklist_template_sections
    WHERE template_id = v_btq_id;

    -- 2) Section id mapping: old (office source) -> new (BTQ target)
    TRUNCATE _btq_promote_sec_map;

    FOR old_sec IN
      SELECT *
      FROM public.checklist_template_sections
      WHERE template_id = cfg.source_template_id
      ORDER BY sort_order ASC NULLS LAST, id ASC
    LOOP
      new_sec_id := gen_random_uuid();
      INSERT INTO public.checklist_template_sections (id, template_id, name, sort_order)
      VALUES (new_sec_id, v_btq_id, old_sec.name, old_sec.sort_order);

      INSERT INTO _btq_promote_sec_map (old_section_id, new_section_id)
      VALUES (old_sec.id, new_sec_id);
    END LOOP;

    -- 3) Copy items; map section_id through _btq_promote_sec_map
    FOR old_item IN
      SELECT *
      FROM public.checklist_template_items
      WHERE template_id = cfg.source_template_id
      ORDER BY sort_order ASC NULLS LAST, id ASC
    LOOP
      v_new_item_section := NULL;
      IF old_item.section_id IS NOT NULL THEN
        SELECT m.new_section_id INTO v_new_item_section
        FROM _btq_promote_sec_map m
        WHERE m.old_section_id = old_item.section_id;

        IF v_new_item_section IS NULL THEN
          RAISE EXCEPTION
            'promote_btq_starters: Item % references section % with no mapping (data inconsistency on source %).',
            old_item.id,
            old_item.section_id,
            cfg.source_template_id;
        END IF;
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
        v_btq_id,
        v_new_item_section,
        old_item.name,
        old_item.requirement,
        old_item.sort_order,
        COALESCE(old_item.is_compliance_document, true)
      );
    END LOOP;

    TRUNCATE _btq_promote_sec_map;

    RAISE NOTICE 'promote_btq_starters: checklist_type=% btq_template_id=% <- source=% (office=%)',
      cfg.checklist_type,
      v_btq_id,
      cfg.source_template_id,
      v_src_office;
  END LOOP;
END;
$$;
