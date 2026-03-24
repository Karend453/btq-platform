-- Idempotency for inbound email attachment ingestion (Resend webhook retries).

ALTER TABLE public.transaction_documents
  ADD COLUMN IF NOT EXISTS ingest_dedupe_key text;

COMMENT ON COLUMN public.transaction_documents.ingest_dedupe_key IS
  'Stable key for inbound ingestion dedupe, e.g. resend:{email_id}:{attachment_id}.';

CREATE UNIQUE INDEX IF NOT EXISTS transaction_documents_ingest_dedupe_key_uq
  ON public.transaction_documents (ingest_dedupe_key)
  WHERE ingest_dedupe_key IS NOT NULL;
