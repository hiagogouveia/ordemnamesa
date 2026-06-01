-- Sprint 74 — Hotfix: "column reference checklist_id is ambiguous" ao iniciar
-- recebimento.
--
-- Causa raiz (introduzida em s69): instantiate_receiving_execution tem
-- RETURNS TABLE(checklist_id uuid, ...). Esse OUT vira uma variável PL/pgSQL
-- chamada `checklist_id`. O INSERT em checklist_shifts adicionado em s69 usa
-- `ON CONFLICT (checklist_id, shift_id)`, cuja expressão de inferência resolve
-- `checklist_id` contra DUAS origens — a coluna checklist_shifts.checklist_id e
-- a variável OUT homônima — disparando ERRCODE 42702.
--
-- Correção: diretiva `#variable_conflict use_column`, que instrui o PL/pgSQL a
-- preferir a coluna da tabela em caso de homonímia. Demais referências do corpo
-- já são qualificadas (a.checklist_id, c.id) ou usam prefixo v_/p_, então a
-- diretiva não altera nenhum outro comportamento. Assinatura, retorno e
-- idempotência permanecem idênticos (contrato com a rota TS preservado).

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
#variable_conflict use_column
DECLARE
  v_existing_checklist  uuid;
  v_existing_assumption uuid;
  v_new_checklist       uuid;
  v_new_assumption      uuid;
  v_template            public.receiving_templates%ROWTYPE;
  v_template_shift_ids  uuid[];
  v_shift_id_shadow     uuid;
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

  -- Turnos do modelo (N:N). Conjunto vazio = "Todos os turnos".
  v_template_shift_ids := ARRAY(
    SELECT rts.shift_id FROM public.receiving_template_shifts rts
     WHERE rts.template_id = p_template_id
     ORDER BY rts.shift_id);

  -- Shadows: shift_id só quando há exatamente 1 turno; enum derivado nesse caso.
  v_shift_id_shadow := CASE WHEN cardinality(v_template_shift_ids) = 1
                            THEN v_template_shift_ids[1] ELSE NULL END;
  v_shift_enum := COALESCE(
    (SELECT CASE WHEN s.shift_type IN ('morning','afternoon','evening')
                 THEN s.shift_type ELSE 'any' END
       FROM public.shifts s
      WHERE s.id = v_shift_id_shadow),
    'any');

  v_user_shift_ids := ARRAY(
    SELECT us.shift_id FROM public.user_shifts us
     WHERE us.restaurant_id = p_restaurant_id
       AND us.user_id = p_user_id);

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
    v_shift_enum, v_shift_id_shadow, NULL, 'active', true, p_user_id, now(),
    'receiving', true,
    v_template.area_id, v_template.role_id, v_template.assigned_to_user_id,
    v_template.enforce_sequential_order,
    v_template.id, p_supplier_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_checklist;

  -- Copia os turnos do modelo para a execução (N:N).
  INSERT INTO public.checklist_shifts (restaurant_id, checklist_id, shift_id)
  SELECT p_restaurant_id, v_new_checklist, sid
    FROM unnest(v_template_shift_ids) AS sid
  ON CONFLICT (checklist_id, shift_id) DO NOTHING;

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
    assumption_shift_id, assumption_shift_ids, assumption_user_shift_ids
  )
  VALUES (
    p_restaurant_id, v_new_checklist, p_user_id, p_user_name,
    v_today, now(), 'in_progress',
    v_shift_id_shadow, v_template_shift_ids, v_user_shift_ids
  )
  RETURNING id INTO v_new_assumption;

  RETURN QUERY SELECT v_new_checklist, v_new_assumption, false;
END;
$$;

COMMENT ON FUNCTION public.instantiate_receiving_execution IS
  'Cria execução one-shot a partir de um receiving_template. Sprint 69: copia turnos N:N (receiving_template_shifts → checklist_shifts) e grava auditoria assumption_shift_ids. Sprint 74: corrige ambiguidade de checklist_id no ON CONFLICT via #variable_conflict use_column. recurrence=NULL (não recorrente). Idempotente.';

COMMIT;
