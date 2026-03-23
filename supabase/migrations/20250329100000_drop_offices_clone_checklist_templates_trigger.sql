-- New offices should not auto-receive checklist_templates. Templates are created only when
-- a broker explicitly clones from BTQ (clone_btq_starter_to_office).
-- Keeps public.clone_btq_templates_to_office and public.trg_offices_clone_checklist_templates
-- in the database unused; drop only the trigger.

DROP TRIGGER IF EXISTS offices_after_insert_clone_checklists ON public.offices;
