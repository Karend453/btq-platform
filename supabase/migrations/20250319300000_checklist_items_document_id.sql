-- Link checklist rows to uploaded transaction documents (one document per item via FK).

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS document_id uuid;

ALTER TABLE public.checklist_items
  ADD CONSTRAINT checklist_items_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.transaction_documents (id)
  ON DELETE SET NULL;
