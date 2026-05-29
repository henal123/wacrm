-- ============================================================
-- 015_apex_nurture_seed.sql
--
-- Seeds the Apex Fashion Lab WhatsApp nurture program as automations +
-- a qualification flow, all idempotent (skipped if already present by name).
--
-- Depends on 014's tag taxonomy (apex_seed_pipelines_and_tags) for tag ids.
--
-- What it creates for a user:
--   * Keyword automations (active immediately — they reply inside the 24h
--     service window, so no approved template is required):
--       - STOP  : tag optout:whatsapp + confirm
--       - START : remove optout:whatsapp + confirm
--       - INTEREST: tag eng:interested + seq:paused, round-robin assign,
--                   acknowledge — the hybrid "interested reply → human" path
--   * Qualification flow (active): first inbound → program picker buttons →
--     set program tag → collect business stage → handoff
--   * Nurture sequences (created INACTIVE — they send templates, which must
--     be approved in Meta first; activate them once templates are live):
--       - "Nurture — Cohort"  (tag_added: program:cohort)
--       - "Nurture — D2D"     (tag_added: program:d2d)
--       - "Nurture — Top of funnel" (tag_added: source:brochure)
--
-- The tag_added sequences rely on the tag_id filter added to the engine's
-- triggerMatches — each fires only for its configured tag.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: create an automation + flat steps (idempotent by name).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apex_make_automation(
  p_user_id UUID,
  p_name TEXT,
  p_trigger_type TEXT,
  p_trigger_config JSONB,
  p_is_active BOOLEAN,
  p_steps JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto_id UUID;
  v_step JSONB;
  v_pos INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM automations WHERE user_id = p_user_id AND name = p_name) THEN
    RETURN;
  END IF;

  INSERT INTO automations (user_id, name, trigger_type, trigger_config, is_active)
  VALUES (p_user_id, p_name, p_trigger_type, COALESCE(p_trigger_config, '{}'::jsonb), p_is_active)
  RETURNING id INTO v_auto_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    INSERT INTO automation_steps (automation_id, parent_step_id, branch, step_type, step_config, position)
    VALUES (
      v_auto_id, NULL, NULL,
      v_step->>'step_type',
      COALESCE(v_step->'step_config', '{}'::jsonb),
      v_pos
    );
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._apex_make_automation(UUID, TEXT, TEXT, JSONB, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Main seed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apex_seed_nurture(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_optout UUID;
  t_interested UUID;
  t_paused UUID;
  t_prog_cohort UUID;
  t_prog_d2d UUID;
  v_flow_id UUID;
BEGIN
  SELECT id INTO t_optout FROM tags WHERE user_id = p_user_id AND name = 'optout:whatsapp';
  SELECT id INTO t_interested FROM tags WHERE user_id = p_user_id AND name = 'eng:interested';
  SELECT id INTO t_paused FROM tags WHERE user_id = p_user_id AND name = 'seq:paused';
  SELECT id INTO t_prog_cohort FROM tags WHERE user_id = p_user_id AND name = 'program:cohort';
  SELECT id INTO t_prog_d2d FROM tags WHERE user_id = p_user_id AND name = 'program:d2d';

  IF t_prog_cohort IS NULL THEN
    RAISE EXCEPTION 'Tags not seeded — run apex_seed_pipelines_and_tags(%) first.', p_user_id;
  END IF;

  -- ---- Keyword automations (active; reply inside the 24h window) ----
  PERFORM public._apex_make_automation(
    p_user_id, 'WhatsApp opt-out (STOP)', 'keyword_match',
    jsonb_build_object('keywords', jsonb_build_array('stop','unsubscribe','opt out','remove','cancel'), 'match_type','contains'),
    TRUE,
    jsonb_build_array(
      jsonb_build_object('step_type','add_tag','step_config', jsonb_build_object('tag_id', t_optout)),
      jsonb_build_object('step_type','send_message','step_config', jsonb_build_object('text','You''re unsubscribed from WhatsApp updates. Reply START anytime to resume.'))
    )
  );

  PERFORM public._apex_make_automation(
    p_user_id, 'WhatsApp opt-in (START)', 'keyword_match',
    jsonb_build_object('keywords', jsonb_build_array('start','resume','subscribe'), 'match_type','contains'),
    TRUE,
    jsonb_build_array(
      jsonb_build_object('step_type','remove_tag','step_config', jsonb_build_object('tag_id', t_optout)),
      jsonb_build_object('step_type','send_message','step_config', jsonb_build_object('text','Welcome back! You''ll receive WhatsApp updates from Apex Fashion Lab again.'))
    )
  );

  PERFORM public._apex_make_automation(
    p_user_id, 'Interested reply → human', 'keyword_match',
    jsonb_build_object('keywords', jsonb_build_array('interested','call','talk','price','pricing','cost','fee','apply','join','details','more info','ready'), 'match_type','contains'),
    TRUE,
    jsonb_build_array(
      jsonb_build_object('step_type','add_tag','step_config', jsonb_build_object('tag_id', t_interested)),
      jsonb_build_object('step_type','add_tag','step_config', jsonb_build_object('tag_id', t_paused)),
      jsonb_build_object('step_type','assign_conversation','step_config', jsonb_build_object('mode','round_robin')),
      jsonb_build_object('step_type','send_message','step_config', jsonb_build_object('text','Thanks for your interest! 🙌 A team member from Apex Fashion Lab will reach out shortly. Feel free to share what you''d like help with.'))
    )
  );

  -- ---- Nurture sequences (INACTIVE — activate after templates approved) ----
  PERFORM public._apex_make_automation(
    p_user_id, 'Nurture — Cohort', 'tag_added',
    jsonb_build_object('tag_id', t_prog_cohort),
    FALSE,
    jsonb_build_array(
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',2,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_value_story','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',2,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_case_study','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',3,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_social_proof','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',4,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_seats_filling','language','en'))
    )
  );

  PERFORM public._apex_make_automation(
    p_user_id, 'Nurture — D2D', 'tag_added',
    jsonb_build_object('tag_id', t_prog_d2d),
    FALSE,
    jsonb_build_array(
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',2,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_value_story','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',2,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_case_study','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',3,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_social_proof','language','en'))
    )
  );

  PERFORM public._apex_make_automation(
    p_user_id, 'Nurture — Top of funnel', 'tag_added',
    (SELECT jsonb_build_object('tag_id', id) FROM tags WHERE user_id = p_user_id AND name = 'source:brochure'),
    FALSE,
    jsonb_build_array(
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',2,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_value_story','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',3,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_case_study','language','en')),
      jsonb_build_object('step_type','wait','step_config', jsonb_build_object('amount',4,'unit','days')),
      jsonb_build_object('step_type','send_template','step_config', jsonb_build_object('template_name','apex_social_proof','language','en'))
    )
  );

  -- ---- Qualification flow (active; interactive sends work in-window) ----
  IF NOT EXISTS (SELECT 1 FROM flows WHERE user_id = p_user_id AND name = 'Lead qualification') THEN
    INSERT INTO flows (user_id, name, description, status, trigger_type, trigger_config, entry_node_id)
    VALUES (
      p_user_id, 'Lead qualification',
      'First inbound → program picker → capture business stage → handoff.',
      'active', 'first_inbound_message', '{}'::jsonb, 'start'
    )
    RETURNING id INTO v_flow_id;

    INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y) VALUES
      (v_flow_id, 'start', 'start',
        jsonb_build_object('next_node_key','ask_program'), 0, 0),
      (v_flow_id, 'ask_program', 'send_buttons',
        jsonb_build_object(
          'text','Welcome to Apex Fashion Lab! 👋 What are you looking for?',
          'footer_text','Tap an option to continue.',
          'buttons', jsonb_build_array(
            jsonb_build_object('reply_id','cohort','title','Join the Cohort','next_node_key','tag_cohort'),
            jsonb_build_object('reply_id','d2d','title','Build my brand','next_node_key','tag_d2d'),
            jsonb_build_object('reply_id','other','title','Something else','next_node_key','handoff')
          )
        ), 0, 120),
      (v_flow_id, 'tag_cohort', 'set_tag',
        jsonb_build_object('mode','add','tag_id', t_prog_cohort, 'next_node_key','ask_stage'), 0, 240),
      (v_flow_id, 'tag_d2d', 'set_tag',
        jsonb_build_object('mode','add','tag_id', t_prog_d2d, 'next_node_key','ask_stage'), 200, 240),
      (v_flow_id, 'ask_stage', 'collect_input',
        jsonb_build_object(
          'prompt_text','Great! Tell us briefly about your brand or idea and where you''re at (just an idea, sampling, already selling, etc.)',
          'var_key','business_stage',
          'next_node_key','handoff'
        ), 0, 360),
      (v_flow_id, 'handoff', 'handoff',
        jsonb_build_object('note','New lead qualified via WhatsApp — program + business stage captured.'), 0, 480);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apex_seed_nurture(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apex_seed_nurture(UUID) TO service_role;

-- ------------------------------------------------------------
-- Auto-run for a single-user install; otherwise run manually:
--   SELECT apex_seed_nurture('<your-user-id>');
-- ------------------------------------------------------------
DO $$
DECLARE
  v_uid UUID;
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users;
  IF v_count = 1 THEN
    SELECT id INTO v_uid FROM auth.users LIMIT 1;
    PERFORM public.apex_seed_nurture(v_uid);
    RAISE NOTICE '[015] nurture seeded for user %', v_uid;
  ELSE
    RAISE NOTICE '[015] nurture seed skipped (% users). Run: SELECT apex_seed_nurture(''<your-user-id>'');', v_count;
  END IF;
END $$;
