-- Foundation for checklist archive groups and per-item archive state (no CHECK constraints yet).

CREATE TABLE IF NOT EXISTS public.checklist_archive_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  label text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_archive_groups_transaction_id
  ON public.checklist_archive_groups (transaction_id);

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_group_id uuid
    REFERENCES public.checklist_archive_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_active_by_transaction
  ON public.checklist_items (transaction_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_archive_group_id
  ON public.checklist_items (archive_group_id)
  WHERE archive_group_id IS NOT NULL;

COMMENT ON COLUMN public.checklist_items.archived_at IS
  'When set, the item is excluded from workflow, compliance, and transaction health calculations.';

COMMENT ON COLUMN public.checklist_items.archive_group_id IS
  'References the archive group this item belongs to when archived; use for grouped archive UI.';

COMMENT ON COLUMN public.checklist_items.template_section_id IS
  'Original template section placement; unchanged when the item is archived (archive is not a section).';
