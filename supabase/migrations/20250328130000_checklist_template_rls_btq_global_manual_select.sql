-- Allow authenticated users to read checklist_template_sections / checklist_template_items
-- when the parent checklist_templates row is one of the two fixed BTQ global sources:
-- office_id IS NULL, created_from = 'manual', checklist_type in (Purchase, Listing).
-- (No template_key/slug column in schema; Purchase = buyer-side, Listing = listing-side.)
-- Supplements existing *_select_office policies (office-owned templates); multiple SELECT
-- policies for the same role are OR-combined.

DROP POLICY IF EXISTS "checklist_template_sections_select_btq_global_manual" ON public.checklist_template_sections;

CREATE POLICY "checklist_template_sections_select_btq_global_manual"
  ON public.checklist_template_sections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      WHERE t.id = checklist_template_sections.template_id
        AND t.office_id IS NULL
        AND t.created_from = 'manual'
        AND t.checklist_type IN ('Purchase', 'Listing')
    )
  );

DROP POLICY IF EXISTS "checklist_template_items_select_btq_global_manual" ON public.checklist_template_items;

CREATE POLICY "checklist_template_items_select_btq_global_manual"
  ON public.checklist_template_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checklist_templates t
      WHERE t.id = checklist_template_items.template_id
        AND t.office_id IS NULL
        AND t.created_from = 'manual'
        AND t.checklist_type IN ('Purchase', 'Listing')
    )
  );
