UPDATE public.transactions t
SET listagent = up.email
FROM public.user_profiles up
WHERE t.agent_user_id = up.id
  AND up.email IS NOT NULL
  AND btrim(up.email) <> ''
  AND (t.listagent IS NULL OR btrim(t.listagent) = '')
  AND (
    (
      lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(seller|list|listing|sell[[:space:]]*side|seller''s)([^[:alnum:]]|$)'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%seller%'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%list%'
    )
    AND NOT (
      lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(buyer|purchase|buy[[:space:]]*side|buyer''s)([^[:alnum:]]|$)'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%buyer%'
    )
  );

UPDATE public.transactions t
SET buyeragent = up.email
FROM public.user_profiles up
WHERE t.agent_user_id = up.id
  AND up.email IS NOT NULL
  AND btrim(up.email) <> ''
  AND (t.buyeragent IS NULL OR btrim(t.buyeragent) = '')
  AND (
    (
      lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(buyer|purchase|buy[[:space:]]*side|buyer''s)([^[:alnum:]]|$)'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%buyer%'
    )
    AND NOT (
      lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(seller|list|listing|sell[[:space:]]*side|seller''s)([^[:alnum:]]|$)'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%seller%'
      OR lower(coalesce(t.transaction_side, '')) LIKE '%list%'
    )
  );

UPDATE public.transactions t
SET
  listagent = up.email,
  buyeragent = up.email
FROM public.user_profiles up
WHERE t.agent_user_id = up.id
  AND up.email IS NOT NULL
  AND btrim(up.email) <> ''
  AND (t.listagent IS NULL OR btrim(t.listagent) = '')
  AND (t.buyeragent IS NULL OR btrim(t.buyeragent) = '')
  AND (
    (
      (
        lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(buyer|purchase|buy[[:space:]]*side|buyer''s)([^[:alnum:]]|$)'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%buyer%'
      )
      AND (
        lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(seller|list|listing|sell[[:space:]]*side|seller''s)([^[:alnum:]]|$)'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%seller%'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%list%'
      )
    )
    OR
    (
      NOT (
        lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(buyer|purchase|buy[[:space:]]*side|buyer''s)([^[:alnum:]]|$)'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%buyer%'
      )
      AND NOT (
        lower(coalesce(t.transaction_side, '')) ~ '(^|[^[:alnum:]])(seller|list|listing|sell[[:space:]]*side|seller''s)([^[:alnum:]]|$)'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%seller%'
        OR lower(coalesce(t.transaction_side, '')) LIKE '%list%'
      )
    )
  );
