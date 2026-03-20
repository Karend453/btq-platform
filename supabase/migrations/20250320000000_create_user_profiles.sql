-- App-level roles (Auth dashboard has no custom app roles).
-- Requires corresponding auth.users rows before INSERT succeeds.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  role text NOT NULL DEFAULT 'agent'
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles (role);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

GRANT SELECT ON public.user_profiles TO authenticated;

INSERT INTO public.user_profiles (id, email, role)
VALUES
  ('89c8d916-f1a3-4981-9145-9e6e56f6c244', 'admin@brokerteq.com', 'admin'),
  ('3c31b740-1c59-4039-b444-e21606e488e9', 'karend453@gmail.com', 'agent')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- Point test transaction at real admin UID (adjust id if your test row differs).
UPDATE public.transactions
SET assigned_admin_user_id = '89c8d916-f1a3-4981-9145-9e6e56f6c244'
WHERE id = '133d5fd0-6298-4e57-822e-345ad812a0f1';
