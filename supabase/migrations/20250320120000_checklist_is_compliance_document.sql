-- Reference vs compliance: template default and live copy on checklist generation.

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS is_compliance_document boolean NOT NULL DEFAULT true;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS is_compliance_document boolean NOT NULL DEFAULT true;
