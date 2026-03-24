-- Per-transaction intake address for document routing (persisted; inbound delivery is separate work).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS intake_email text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_intake_email_key
  ON public.transactions (intake_email);

COMMENT ON COLUMN public.transactions.intake_email IS 'Unique BTQ intake address for this transaction.';
