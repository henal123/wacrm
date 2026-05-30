-- ============================================================
-- 018_apex_reengage_tail.sql
--
-- Extends the three Apex drip sequences seeded by 015 with a long-tail
-- re-engagement arm. Without this, a contact who never replies falls off
-- the bottom of the drip after ~2 weeks. With it, they get nudged again
-- ~2 weeks later, then once a month for two months — exactly when the
-- next cohort wave is opening.
--
-- Appended after the existing steps (so the catch-up is silent for anyone
-- already partway through the drip):
--   wait 14d → apex_reengage
--   wait 30d → apex_next_wave
--   wait 30d → apex_seats_filling
--
-- Applies to:
--   * "Nurture — Cohort"
--   * "Nurture — D2D"
--   * "Nurture — Top of funnel"
--
-- Idempotent: guarded by "is there already a send_template step for
-- apex_reengage on this automation?" — re-running is a no-op.
-- ============================================================

CREATE OR REPLACE FUNCTION public._apex_append_reengage_tail(
  p_user_id UUID,
  p_automation_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto_id UUID;
  v_max_pos INT;
  v_already BOOLEAN;
BEGIN
  SELECT id INTO v_auto_id FROM automations
   WHERE user_id = p_user_id AND name = p_automation_name;
  IF v_auto_id IS NULL THEN
    RAISE NOTICE 'Automation % not found for user % — skipping.', p_automation_name, p_user_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM automation_steps
     WHERE automation_id = v_auto_id
       AND step_type = 'send_template'
       AND step_config->>'template_name' = 'apex_reengage'
  ) INTO v_already;
  IF v_already THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(position), -1) INTO v_max_pos
    FROM automation_steps WHERE automation_id = v_auto_id;

  INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position) VALUES
    (v_auto_id, NULL, NULL, 'wait',
       jsonb_build_object('amount',14,'unit','days'), v_max_pos + 1),
    (v_auto_id, NULL, NULL, 'send_template',
       jsonb_build_object('template_name','apex_reengage','language','en'), v_max_pos + 2),
    (v_auto_id, NULL, NULL, 'wait',
       jsonb_build_object('amount',30,'unit','days'), v_max_pos + 3),
    (v_auto_id, NULL, NULL, 'send_template',
       jsonb_build_object('template_name','apex_next_wave','language','en'), v_max_pos + 4),
    (v_auto_id, NULL, NULL, 'wait',
       jsonb_build_object('amount',30,'unit','days'), v_max_pos + 5),
    (v_auto_id, NULL, NULL, 'send_template',
       jsonb_build_object('template_name','apex_seats_filling','language','en'), v_max_pos + 6);
END;
$$;

REVOKE ALL ON FUNCTION public._apex_append_reengage_tail(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._apex_append_reengage_tail(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public._apex_append_reengage_tail(UUID, TEXT) FROM authenticated;

-- Apply to the Apex operator's three drips. Resolves the operator by the
-- same email 014/015 use. If no such user exists yet (fresh template
-- install), the DO block is a no-op and the function above is still
-- available for later manual invocation.
DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users
   WHERE email = 'apexitsolutions.pvtltd@gmail.com'
   LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE '018: Apex operator user not found — skipping.';
    RETURN;
  END IF;
  PERFORM public._apex_append_reengage_tail(v_uid, 'Nurture — Cohort');
  PERFORM public._apex_append_reengage_tail(v_uid, 'Nurture — D2D');
  PERFORM public._apex_append_reengage_tail(v_uid, 'Nurture — Top of funnel');
END $$;
