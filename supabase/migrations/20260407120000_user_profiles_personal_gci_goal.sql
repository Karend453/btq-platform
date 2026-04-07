-- Personal annual GCI goal (USD-style amount). Nullable = app uses default (3,000,000) in analytics.
-- Writes go through SECURITY DEFINER RPC so we do not grant broad UPDATE on user_profiles.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS personal_gci_goal numeric;

COMMENT ON COLUMN public.user_profiles.personal_gci_goal IS
  'Optional personal GCI goal amount; NULL means use client default for analytics.';

CREATE OR REPLACE FUNCTION public.set_my_personal_gci_goal (p_goal numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid ();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_goal IS NOT NULL THEN
    IF p_goal <= 0 OR p_goal > 1000000000000::numeric THEN
      RAISE EXCEPTION 'Goal must be positive and within a reasonable range';
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET personal_gci_goal = p_goal
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_personal_gci_goal (numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_personal_gci_goal (numeric) TO authenticated;
