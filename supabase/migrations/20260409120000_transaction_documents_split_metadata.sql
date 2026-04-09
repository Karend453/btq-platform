-- Split workspace: link derived documents to source PDF and record page indices (Phase 1 may reuse source storage).

ALTER TABLE public.transaction_documents
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.transaction_documents (id) ON DELETE SET NULL;

ALTER TABLE public.transaction_documents
  ADD COLUMN IF NOT EXISTS split_page_indices integer[];

COMMENT ON COLUMN public.transaction_documents.source_document_id IS
  'When set, this document row was created from a split of the referenced source document.';

COMMENT ON COLUMN public.transaction_documents.split_page_indices IS
  '1-based page indices in the source PDF included in this split output.';
