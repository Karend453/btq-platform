-- Per-user preferred forms / e-sign provider (dotloop, skyslope, zipforms, other, none).
-- User-level (not office-level) since agents within one office often use different tools.
-- Writes go through SECURITY DEFINER RPC so we do not grant broad UPDATE on user_profiles.
-- No credentials are stored — only the user's chosen provider label for UI personalization.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_forms_provider text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_preferred_forms_provider_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_preferred_forms_provider_check
      CHECK (
        preferred_forms_provider IS NULL
        OR preferred_forms_provider IN ('dotloop', 'skyslope', 'zipforms', 'other', 'none')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.user_profiles.preferred_forms_provider IS
  'Optional per-user forms/e-sign provider preference. One of dotloop, skyslope, zipforms, other, none, or NULL when unset. Used for UI personalization only — no credentials stored.';

CREATE OR REPLACE FUNCTION public.set_my_preferred_forms_provider (p_provider text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid ();
  v_value text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_provider IS NULL THEN
    v_value := NULL;
  ELSE
    v_value := lower(trim(p_provider));
    IF v_value = '' THEN
      v_value := NULL;
    ELSIF v_value NOT IN ('dotloop', 'skyslope', 'zipforms', 'other', 'none') THEN
      RAISE EXCEPTION 'Invalid forms provider: %', p_provider;
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET preferred_forms_provider = v_value
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_preferred_forms_provider (text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_preferred_forms_provider (text) TO authenticated;
