-- ============================================================
-- 014_apex_lead_ingestion.sql
--
-- Lead ingestion for the Apex Fashion Lab website → wacrm pipe.
--
-- Adds three service-role functions (SECURITY DEFINER, so they bypass
-- RLS exactly like the service-role client the webhook/engines use):
--
--   * _apex_set_cf(user, contact, field, value)
--       internal helper — find-or-create a custom_field and upsert its
--       value for a contact.
--
--   * apex_seed_pipelines_and_tags(user)
--       idempotent per-user seed of the Cohort Admissions + D2D Sales
--       pipelines, the nurture tag taxonomy, and the lead custom fields.
--       Safe to re-run; only inserts what's missing.
--
--   * ingest_lead(...)
--       atomic, advisory-locked upsert called by POST /api/leads/ingest.
--       contacts has no UNIQUE(user_id, phone), so concurrent website
--       submits for the same number would otherwise double-insert. An
--       advisory xact lock on (user_id, last-10-digits) serializes the
--       find-or-create. Dedupe matches on the last 10 digits so +91 /
--       0-prefixed / bare-10-digit variants of one Indian number collapse
--       to a single contact. Returns the resolved ids + a deduped flag.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- Custom-field upsert helper (internal).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apex_set_cf(
  p_user_id UUID,
  p_contact_id UUID,
  p_field TEXT,
  p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field_id UUID;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_field_id
  FROM custom_fields
  WHERE user_id = p_user_id AND field_name = p_field;

  IF v_field_id IS NULL THEN
    INSERT INTO custom_fields (user_id, field_name, field_type)
    VALUES (p_user_id, p_field, 'text')
    RETURNING id INTO v_field_id;
  END IF;

  INSERT INTO contact_custom_values (contact_id, custom_field_id, value)
  VALUES (p_contact_id, v_field_id, p_value)
  ON CONFLICT (contact_id, custom_field_id) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

REVOKE ALL ON FUNCTION public._apex_set_cf(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apex_set_cf(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public._apex_set_cf(UUID, UUID, TEXT, TEXT) FROM authenticated;

-- ------------------------------------------------------------
-- Idempotent per-user seed: pipelines, stages, tags, custom fields.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apex_seed_pipelines_and_tags(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
  v_tag TEXT;
  v_field TEXT;
  i INT;
  v_cohort_stages TEXT[] := ARRAY[
    'Applied', 'Screened', 'Call Booked', 'Interviewed', 'Accepted', 'Enrolled', 'Rejected'
  ];
  v_d2d_stages TEXT[] := ARRAY[
    'Inquiry', 'Discovery Call', 'Proposal', 'Negotiation', 'Won', 'Lost'
  ];
  v_tags TEXT[] := ARRAY[
    'source:brochure', 'source:cohort-app', 'source:d2d-inquiry', 'source:contact',
    'source:fb-lead', 'source:referral', 'source:manual',
    'program:cohort', 'program:d2d', 'program:advisory',
    'stage:new', 'stage:engaged', 'stage:call-booked', 'stage:call-noshow',
    'stage:call-done', 'stage:proposal', 'stage:won', 'stage:lost',
    'biz:student', 'biz:founder', 'biz:professional', 'biz:retailer', 'biz:career-changer',
    'temp:hot', 'temp:warm', 'temp:cold',
    'eng:replied', 'eng:interested', 'eng:clicked', 'eng:noresp-7d', 'eng:noresp-30d',
    'seq:cohort', 'seq:d2d', 'seq:tof', 'seq:proposal', 'seq:reengage', 'seq:paused',
    'cohort:wave-current', 'cohort:waitlist',
    'customer:cohort', 'customer:d2d', 'customer:alumni',
    'optout:whatsapp', 'dnd:marketing'
  ];
  v_fields TEXT[] := ARRAY[
    'business_stage', 'application_status', 'portfolio_url', 'marketing_consent',
    'external_ref', 'call_at', 'last_bot_msg_at', 'lead_score'
  ];
BEGIN
  -- Cohort Admissions pipeline + stages.
  SELECT id INTO v_pipeline_id
  FROM pipelines WHERE user_id = p_user_id AND name = 'Cohort Admissions';
  IF v_pipeline_id IS NULL THEN
    INSERT INTO pipelines (user_id, name) VALUES (p_user_id, 'Cohort Admissions')
    RETURNING id INTO v_pipeline_id;
  END IF;
  FOR i IN 1 .. array_length(v_cohort_stages, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = v_cohort_stages[i]
    ) THEN
      INSERT INTO pipeline_stages (pipeline_id, name, position)
      VALUES (v_pipeline_id, v_cohort_stages[i], i - 1);
    END IF;
  END LOOP;

  -- D2D Sales pipeline + stages.
  SELECT id INTO v_pipeline_id
  FROM pipelines WHERE user_id = p_user_id AND name = 'D2D Sales';
  IF v_pipeline_id IS NULL THEN
    INSERT INTO pipelines (user_id, name) VALUES (p_user_id, 'D2D Sales')
    RETURNING id INTO v_pipeline_id;
  END IF;
  FOR i IN 1 .. array_length(v_d2d_stages, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = v_d2d_stages[i]
    ) THEN
      INSERT INTO pipeline_stages (pipeline_id, name, position)
      VALUES (v_pipeline_id, v_d2d_stages[i], i - 1);
    END IF;
  END LOOP;

  -- Tag taxonomy.
  FOREACH v_tag IN ARRAY v_tags LOOP
    IF NOT EXISTS (SELECT 1 FROM tags WHERE user_id = p_user_id AND name = v_tag) THEN
      INSERT INTO tags (user_id, name, color) VALUES (p_user_id, v_tag, '#6366f1');
    END IF;
  END LOOP;

  -- Custom fields.
  FOREACH v_field IN ARRAY v_fields LOOP
    IF NOT EXISTS (SELECT 1 FROM custom_fields WHERE user_id = p_user_id AND field_name = v_field) THEN
      INSERT INTO custom_fields (user_id, field_name, field_type) VALUES (p_user_id, v_field, 'text');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apex_seed_pipelines_and_tags(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apex_seed_pipelines_and_tags(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.apex_seed_pipelines_and_tags(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apex_seed_pipelines_and_tags(UUID) TO service_role;

-- ------------------------------------------------------------
-- Atomic lead ingestion.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_lead(
  p_user_id UUID,
  p_phone TEXT,
  p_name TEXT,
  p_email TEXT,
  p_source TEXT,
  p_program TEXT,
  p_business_stage TEXT,
  p_application_status TEXT,
  p_portfolio TEXT,
  p_marketing_consent BOOLEAN,
  p_external_ref TEXT,
  p_notes TEXT,
  p_create_deal BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_conversation_id UUID;
  v_deal_id UUID;
  v_deduped BOOLEAN := FALSE;
  v_pipeline_id UUID;
  v_stage_id UUID;
  v_pipeline_name TEXT;
  v_stage_name TEXT;
  v_tag_id UUID;
  v_tag TEXT;
  v_last10 TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
BEGIN
  IF p_user_id IS NULL OR coalesce(v_last10, '') = '' THEN
    RAISE EXCEPTION 'ingest_lead requires p_user_id and a phone with >=10 digits';
  END IF;

  -- Serialize concurrent ingests for the same (user, number). Released at
  -- the end of this function's implicit transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || v_last10));

  -- Dedupe by last-10-digit match (handles +91 / 0-prefix / bare 10-digit).
  SELECT id INTO v_contact_id
  FROM contacts
  WHERE user_id = p_user_id
    AND right(regexp_replace(phone, '\D', '', 'g'), 10) = v_last10
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (user_id, phone, name, email)
    VALUES (p_user_id, p_phone, NULLIF(p_name, ''), NULLIF(p_email, ''))
    RETURNING id INTO v_contact_id;
  ELSE
    v_deduped := TRUE;
    UPDATE contacts SET
      name = COALESCE(NULLIF(name, ''), NULLIF(p_name, '')),
      email = COALESCE(NULLIF(email, ''), NULLIF(p_email, '')),
      updated_at = NOW()
    WHERE id = v_contact_id;
  END IF;

  -- Tags: source, program, lifecycle stage:new (find-or-create then link).
  FOREACH v_tag IN ARRAY ARRAY[
    CASE WHEN COALESCE(p_source, '') <> '' THEN 'source:' || p_source END,
    CASE WHEN COALESCE(p_program, '') <> '' THEN 'program:' || p_program END,
    'stage:new'
  ] LOOP
    IF v_tag IS NULL THEN CONTINUE; END IF;
    SELECT id INTO v_tag_id FROM tags WHERE user_id = p_user_id AND name = v_tag;
    IF v_tag_id IS NULL THEN
      INSERT INTO tags (user_id, name, color) VALUES (p_user_id, v_tag, '#6366f1')
      RETURNING id INTO v_tag_id;
    END IF;
    INSERT INTO contact_tags (contact_id, tag_id) VALUES (v_contact_id, v_tag_id)
    ON CONFLICT (contact_id, tag_id) DO NOTHING;
  END LOOP;

  -- Custom fields.
  PERFORM public._apex_set_cf(p_user_id, v_contact_id, 'business_stage', p_business_stage);
  PERFORM public._apex_set_cf(p_user_id, v_contact_id, 'application_status', p_application_status);
  PERFORM public._apex_set_cf(p_user_id, v_contact_id, 'portfolio_url', p_portfolio);
  PERFORM public._apex_set_cf(
    p_user_id, v_contact_id, 'marketing_consent',
    CASE WHEN p_marketing_consent THEN 'true' ELSE 'false' END
  );
  PERFORM public._apex_set_cf(p_user_id, v_contact_id, 'external_ref', p_external_ref);

  -- Freeform note (contact/inquiry message).
  IF COALESCE(p_notes, '') <> '' THEN
    INSERT INTO contact_notes (contact_id, user_id, note_text)
    VALUES (v_contact_id, p_user_id, p_notes);
  END IF;

  -- Conversation (find-or-create; needed for later template sends).
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE user_id = p_user_id AND contact_id = v_contact_id
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (user_id, contact_id, status)
    VALUES (p_user_id, v_contact_id, 'open')
    RETURNING id INTO v_conversation_id;
  END IF;

  -- Deal (cohort/d2d only). Skipped silently if the pipeline isn't seeded.
  IF p_create_deal THEN
    IF p_program = 'd2d' THEN
      v_pipeline_name := 'D2D Sales'; v_stage_name := 'Inquiry';
    ELSE
      v_pipeline_name := 'Cohort Admissions'; v_stage_name := 'Applied';
    END IF;

    SELECT p.id, s.id INTO v_pipeline_id, v_stage_id
    FROM pipelines p
    JOIN pipeline_stages s ON s.pipeline_id = p.id AND s.name = v_stage_name
    WHERE p.user_id = p_user_id AND p.name = v_pipeline_name
    LIMIT 1;

    IF v_pipeline_id IS NOT NULL AND v_stage_id IS NOT NULL THEN
      -- Idempotency: don't duplicate when an open deal already exists for
      -- this contact+pipeline, or when this external_ref was already used.
      IF NOT EXISTS (
        SELECT 1 FROM deals d
        WHERE d.user_id = p_user_id
          AND d.pipeline_id = v_pipeline_id
          AND d.contact_id = v_contact_id
          AND d.status = 'open'
      ) AND (
        COALESCE(p_external_ref, '') = '' OR NOT EXISTS (
          SELECT 1
          FROM contact_custom_values ccv
          JOIN custom_fields cf ON cf.id = ccv.custom_field_id
          JOIN deals d2 ON d2.contact_id = ccv.contact_id
          WHERE cf.user_id = p_user_id
            AND cf.field_name = 'external_ref'
            AND ccv.value = p_external_ref
            AND d2.contact_id <> v_contact_id
        )
      ) THEN
        INSERT INTO deals (
          user_id, pipeline_id, stage_id, contact_id, conversation_id,
          title, value, currency, status
        )
        VALUES (
          p_user_id, v_pipeline_id, v_stage_id, v_contact_id, v_conversation_id,
          COALESCE(NULLIF(p_name, ''), 'Lead') || ' — '
            || COALESCE(NULLIF(p_program, ''), NULLIF(p_source, ''), 'lead'),
          0, 'INR', 'open'
        )
        RETURNING id INTO v_deal_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'deal_id', v_deal_id,
    'deduped', v_deduped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_lead(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_lead(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN
) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_lead(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_lead(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN
) TO service_role;

-- ------------------------------------------------------------
-- Seed the operator on a single-user install. On multi-user installs the
-- seed is skipped — run it manually with your own id:
--   SELECT apex_seed_pipelines_and_tags('<your-user-id>');
-- ------------------------------------------------------------
DO $$
DECLARE
  v_uid UUID;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users;
  IF v_count = 1 THEN
    SELECT id INTO v_uid FROM auth.users LIMIT 1;
    PERFORM public.apex_seed_pipelines_and_tags(v_uid);
    RAISE NOTICE '[014] apex pipelines/tags seeded for user %', v_uid;
  ELSE
    RAISE NOTICE '[014] apex seed skipped (% users). Run: SELECT apex_seed_pipelines_and_tags(''<your-user-id>'');', v_count;
  END IF;
END $$;
