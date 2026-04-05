-- Team Management: brokers add/reactivate admin & agent seats via `office_memberships` only (active/inactive; no deletes).
-- Mutations use SECURITY DEFINER RPCs; `user_profiles` is not updated here (memberships are the write target).

ALTER TABLE public.office_memberships ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.office_memberships TO authenticated;

DROP POLICY IF EXISTS "office_memberships_select_scope" ON public.office_memberships;

CREATE POLICY "office_memberships_select_scope"
  ON public.office_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid ()
    OR EXISTS (
      SELECT 1
      FROM public.office_memberships AS om_viewer
      WHERE om_viewer.office_id = office_memberships.office_id
        AND om_viewer.user_id = auth.uid ()
        AND om_viewer.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.broker_add_office_member (
  p_office_id uuid,
  p_email text,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_uid uuid := auth.uid ();
  v_target_id uuid;
  v_norm_email text;
BEGIN
  IF v_broker_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'Role must be admin or agent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.office_memberships om
    WHERE om.office_id = p_office_id
      AND om.user_id = v_broker_uid
      AND om.role = 'broker'
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_norm_email := lower(trim(coalesce(p_email, '')));
  IF v_norm_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT up.id
  INTO v_target_id
  FROM public.user_profiles up
  WHERE lower(trim(coalesce(up.email, ''))) = v_norm_email
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that email';
  END IF;

  IF v_target_id = v_broker_uid THEN
    RAISE EXCEPTION 'You cannot add yourself';
  END IF;

  INSERT INTO public.office_memberships (
    office_id,
    user_id,
    role,
    status
  )
  VALUES (
    p_office_id,
    v_target_id,
    p_role,
    'active'
  )
  ON CONFLICT (office_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now ();
END;
$$;

CREATE OR REPLACE FUNCTION public.broker_deactivate_office_member (
  p_office_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_uid uuid := auth.uid ();
  v_member_role text;
BEGIN
  IF v_broker_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.office_memberships om
    WHERE om.office_id = p_office_id
      AND om.user_id = v_broker_uid
      AND om.role = 'broker'
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = v_broker_uid THEN
    RAISE EXCEPTION 'You cannot remove your own membership';
  END IF;

  SELECT om.role
  INTO v_member_role
  FROM public.office_memberships om
  WHERE om.office_id = p_office_id
    AND om.user_id = p_user_id
  LIMIT 1;

  IF v_member_role IS NULL THEN
    RAISE EXCEPTION 'Member not found in this office';
  END IF;

  IF v_member_role = 'broker' THEN
    RAISE EXCEPTION 'The broker cannot be removed from the office';
  END IF;

  IF v_member_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'This membership cannot be removed here';
  END IF;

  UPDATE public.office_memberships
  SET
    status = 'inactive',
    updated_at = now ()
  WHERE office_id = p_office_id
    AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_add_office_member (uuid, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.broker_deactivate_office_member (uuid, uuid) TO authenticated;
