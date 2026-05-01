-- Tie-breaker columns for template section/item ordering: sort_order ASC, then created_at ASC, then id (app).

ALTER TABLE public.checklist_template_sections
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.checklist_template_sections.created_at IS
  'Ordering tie-break when sort_order matches; rows before this migration share the migration timestamp.';

COMMENT ON COLUMN public.checklist_template_items.created_at IS
  'Ordering tie-break when sort_order matches; rows before this migration share the migration timestamp.';
