-- Transaction-only custom checklist items: nullable template link, section placement, sort order.

ALTER TABLE public.checklist_items
  ALTER COLUMN template_item_id DROP NOT NULL;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS template_section_id uuid NULL
  REFERENCES public.checklist_template_sections(id)
  ON DELETE SET NULL;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.checklist_items
  DROP CONSTRAINT IF EXISTS checklist_items_transaction_id_template_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS checklist_items_unique_template_per_tx
  ON public.checklist_items (transaction_id, template_item_id)
  WHERE template_item_id IS NOT NULL;

ALTER TABLE public.checklist_items
  DROP CONSTRAINT IF EXISTS checklist_items_template_or_section_check;

ALTER TABLE public.checklist_items
  ADD CONSTRAINT checklist_items_template_or_section_check
  CHECK (template_item_id IS NOT NULL OR template_section_id IS NOT NULL);

UPDATE public.checklist_items ci
SET sort_order = COALESCE(cti.sort_order, 0)
FROM public.checklist_template_items cti
WHERE ci.template_item_id = cti.id;

UPDATE public.checklist_items ci
SET template_section_id = cti.section_id
FROM public.checklist_template_items cti
WHERE ci.template_item_id = cti.id;

COMMENT ON COLUMN public.checklist_items.template_section_id IS
  'Placement in template section; required when template_item_id is null (custom item).';
COMMENT ON COLUMN public.checklist_items.sort_order IS
  'Order within section; template-sourced rows match template sort_order; custom items append.';
