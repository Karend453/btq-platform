-- Back Office v1: full office list for internal tooling only (no new columns).
--
-- Authorization: caller must have `user_profiles.role = 'admin'`. That check is a **temporary BTQ
-- Back Office wall** until dedicated BTQ/internal roles exist — **not** the final long-term model.
-- Do not rename `admin` to `superadmin` (or add parallel role names) in this migration; keep the
-- existing role string and only gate on it here.

CREATE OR REPLACE FUNCTION public.list_offices_for_back_office ()
RETURNS TABLE (
  id uuid,
  name text,
  display_name text,
  state text,
  address_line1 text,
  city text,
  postal_code text,
  broker_name text,
  broker_email text,
  mls_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid () IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Temporary BTQ Back Office gate (see file header); aligns with `canAccessBtqBackOffice` in app.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid ()
      AND lower(trim(up.role)) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name::text,
    o.display_name::text,
    o.state::text,
    o.address_line1::text,
    o.city::text,
    o.postal_code::text,
    o.broker_name::text,
    o.broker_email::text,
    o.mls_name::text
  FROM public.offices o
  ORDER BY o.name ASC NULLS LAST, o.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_offices_for_back_office () TO authenticated;
