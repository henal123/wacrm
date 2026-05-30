-- ============================================================
-- 017_phone_dedupe_index.sql
--
-- Indexed last-10-digit phone lookup for two callers:
--   * The webhook's findOrCreateContact (was a full scan + JS filter — slow
--     at 10k+ contacts).
--   * The new POST /api/contacts/check-phone dedupe gate on the Contacts UI.
--
-- Adds a functional index on right(digits(phone),10) and an RPC that uses it.
-- Both are scoped by user_id (RLS is bypassed by service-role callers).
-- Idempotent.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contacts_phone_last10
  ON contacts (user_id, (right(regexp_replace(phone, '\D', '', 'g'), 10)));

CREATE OR REPLACE FUNCTION public.find_contact_by_phone_last10(
  p_user_id UUID,
  p_last10 TEXT
)
RETURNS SETOF contacts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM contacts
  WHERE user_id = p_user_id
    AND right(regexp_replace(phone, '\D', '', 'g'), 10) = p_last10
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_contact_by_phone_last10(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_contact_by_phone_last10(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.find_contact_by_phone_last10(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_contact_by_phone_last10(UUID, TEXT) TO service_role;
