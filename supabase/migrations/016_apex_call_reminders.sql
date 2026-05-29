-- ============================================================
-- 016_apex_call_reminders.sql
--
-- Two "reminder" automations the TidyCal webhook schedules via
-- automation_pending_executions (run_at = call - 24h / call - 2h). They are
-- never trigger-dispatched (trigger_type time_based, inactive) — only resumed
-- by the cron, which ignores is_active. The send_template variables use
-- {{vars.name}} / {{vars.call_time}}, filled at send time from the pending
-- execution's context (engine interpolates template params as of this change).
--
-- Depends on 015's _apex_make_automation helper. Idempotent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apex_seed_call_reminders(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._apex_make_automation(
    p_user_id, 'Call reminder 24h', 'time_based', '{}'::jsonb, FALSE,
    jsonb_build_array(
      jsonb_build_object('step_type','send_template','step_config',
        jsonb_build_object(
          'template_name','apex_call_reminder_24h','language','en',
          'variables', jsonb_build_object('1','{{vars.name}}','2','{{vars.call_time}}')
        ))
    )
  );

  PERFORM public._apex_make_automation(
    p_user_id, 'Call reminder 2h', 'time_based', '{}'::jsonb, FALSE,
    jsonb_build_array(
      jsonb_build_object('step_type','send_template','step_config',
        jsonb_build_object(
          'template_name','apex_call_reminder_2h','language','en',
          'variables', jsonb_build_object('1','{{vars.name}}','2','{{vars.call_time}}')
        ))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apex_seed_call_reminders(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apex_seed_call_reminders(UUID) TO service_role;

DO $$
DECLARE
  v_uid UUID;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users;
  IF v_count = 1 THEN
    SELECT id INTO v_uid FROM auth.users LIMIT 1;
    PERFORM public.apex_seed_call_reminders(v_uid);
    RAISE NOTICE '[016] call reminders seeded for user %', v_uid;
  ELSE
    RAISE NOTICE '[016] call reminders skipped (% users). Run: SELECT apex_seed_call_reminders(''<your-user-id>'');', v_count;
  END IF;
END $$;
