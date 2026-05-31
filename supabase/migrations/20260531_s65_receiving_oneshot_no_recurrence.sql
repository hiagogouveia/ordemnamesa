-- Sprint 65 — Execução de recebimento não é recorrente
--
-- Uma instância one-shot representa um evento operacional iniciado por um
-- colaborador em um dia específico. Não deve herdar comportamento de checklist
-- recorrente (reaparecer todo dia, ser resetada pela lógica diária).
--
-- 1) RPC instantiate_receiving_execution: grava recurrence = NULL na instância
--    (antes caía no default 'daily'). NULL = sem recorrência; o loop de reset
--    diário do Kanban ignora (`if (!cl.recurrence) continue`). A visibilidade
--    passa a ser governada pela regra "assumida hoje" (nas rotas), não pela
--    recorrência.
-- 2) Saneamento: normaliza instâncias one-shot já existentes para recurrence
--    NULL, impedindo que o reset diário apague seus task_executions e alinhando
--    os dados ao novo modelo. (A visibilidade dessas instâncias antigas já é
--    corrigida pela regra "assumida hoje" — este UPDATE é higiene de dados.)

BEGIN;

CREATE OR REPLACE FUNCTION public.instantiate_receiving_execution(
  p_restaurant_id   uuid,
  p_template_id     uuid,
  p_supplier_id     uuid,
  p_user_id         uuid,
  p_user_name       text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  checklist_id  uuid,
  assumption_id uuid,
  was_duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_checklist  uuid;
  v_existing_assumption uuid;
  v_new_checklist       uuid;
  v_new_assumption      uuid;
  v_template            public.receiving_templates%ROWTYPE;
  v_shift_enum          text;
  v_user_shift_ids      uuid[];
  v_today               text := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD');
BEGIN
  SELECT c.id INTO v_existing_checklist
  FROM public.checklists c
  WHERE c.idempotency_key = p_idempotency_key
    AND c.restaurant_id = p_restaurant_id;

  IF v_existing_checklist IS NOT NULL THEN
    SELECT a.id INTO v_existing_assumption
    FROM public.checklist_assumptions a
    WHERE a.checklist_id = v_existing_checklist
    LIMIT 1;

    RETURN QUERY SELECT v_existing_checklist, v_existing_assumption, true;
    RETURN;
  END IF;

  SELECT * INTO v_template
  FROM public.receiving_templates
  WHERE id = p_template_id
    AND restaurant_id = p_restaurant_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  v_shift_enum := COALESCE(
    (SELECT CASE WHEN s.shift_type IN ('morning','afternoon','evening')
                 THEN s.shift_type ELSE 'any' END
       FROM public.shifts s
      WHERE s.id = v_template.shift_id),
    'any');

  v_user_shift_ids := ARRAY(
    SELECT us.shift_id FROM public.user_shifts us
     WHERE us.restaurant_id = p_restaurant_id
       AND us.user_id = p_user_id);

  -- recurrence = NULL: execução one-shot não é recorrente.
  INSERT INTO public.checklists (
    restaurant_id, name, description,
    shift, shift_id, recurrence, status, active, created_by, created_at,
    checklist_type, is_one_shot,
    area_id, role_id, assigned_to_user_id,
    enforce_sequential_order,
    source_template_id, supplier_id,
    idempotency_key
  )
  VALUES (
    p_restaurant_id, v_template.name, v_template.description,
    v_shift_enum, v_template.shift_id, NULL, 'active', true, p_user_id, now(),
    'receiving', true,
    v_template.area_id, v_template.role_id, v_template.assigned_to_user_id,
    v_template.enforce_sequential_order,
    v_template.id, p_supplier_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_checklist;

  INSERT INTO public.checklist_tasks (
    checklist_id, restaurant_id, title, description, "order",
    requires_photo, is_critical, requires_observation,
    type, max_photos, task_config
  )
  SELECT
    v_new_checklist, p_restaurant_id, tt.title, tt.description, tt."order",
    tt.requires_photo, tt.is_critical, tt.requires_observation,
    tt.type, tt.max_photos, tt.task_config
  FROM public.receiving_template_tasks tt
  WHERE tt.template_id = p_template_id
  ORDER BY tt."order";

  INSERT INTO public.checklist_assumptions (
    restaurant_id, checklist_id, user_id, user_name,
    date_key, assumed_at, execution_status,
    assumption_shift_id, assumption_user_shift_ids
  )
  VALUES (
    p_restaurant_id, v_new_checklist, p_user_id, p_user_name,
    v_today, now(), 'in_progress',
    v_template.shift_id, v_user_shift_ids
  )
  RETURNING id INTO v_new_assumption;

  RETURN QUERY SELECT v_new_checklist, v_new_assumption, false;
END;
$$;

COMMENT ON FUNCTION public.instantiate_receiving_execution IS
  'Cria execução one-shot a partir de um receiving_template. Transacional, idempotente. Sprint 64: propaga shift_id + auditoria de turno. Sprint 65: recurrence=NULL (execução não-recorrente). Auth/escopo são responsabilidade do caller.';

-- 2) Saneamento: instâncias one-shot existentes deixam de ser recorrentes.
UPDATE public.checklists
   SET recurrence = NULL
 WHERE is_one_shot = true
   AND recurrence IS NOT NULL;

COMMIT;
