-- Allow authenticated users to read (select) objects in transaction-documents bucket.
-- Required for createSignedUrl to work when viewing attachments.
-- Run: supabase db push (or apply via Supabase Dashboard SQL editor).
-- If policy already exists, drop it first or skip this migration.

CREATE POLICY "btq_transaction_docs_authenticated_read"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'transaction-documents' );
