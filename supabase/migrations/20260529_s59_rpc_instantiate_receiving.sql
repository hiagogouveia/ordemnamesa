-- Sprint 59 — RPC enxuta para Etapa 2 do refator de Recebimentos
--
-- 1) instantiate_receiving_execution: faz, em uma única transação,
--    o INSERT atômico de checklist (execução one-shot) + checklist_tasks
--    (snapshot do template) + checklist_assumption (já in_progress).
--    Idempotência via UNIQUE(idempotency_key) — se a key já existir,
--    retorna a execução existente com was_duplicate=true.
--
-- 2) replace_receiving_template_tasks: substitui em bloco as tasks de
--    um template (DELETE + INSERT na mesma transação) preservando
--    snapshots em execuções já criadas (que vivem em checklist_tasks).
--
-- Auth/permissão NÃO é checada nas funções — as rotas TS validam
-- membership, escopo e existência do template ATIVO antes de invocar.
-- As RPCs assumem que o caller já é confiável (service-role).

BEGIN;

-- ===========================================================================
-- 1) instantiate_receiving_execution
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.instantiate_receiving_execution(
  p_restaurant_id   uuid,
  p_template_id     uuid,
  p_supplier_id     uuid,        -- NULL aceitável
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
  v_today               text := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD');
BEGIN
  -- 1. Idempotency check
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

  -- 2. Snapshot do template
  SELECT * INTO v_template
  FROM public.receiving_templates
  WHERE id = p_template_id
    AND restaurant_id = p_restaurant_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  -- 3. INSERT execução one-shot
  INSERT INTO public.checklists (
    restaurant_id, name, description,
    shift, status, active, created_by, created_at,
    checklist_type, is_one_shot,
    area_id, role_id, assigned_to_user_id,
    enforce_sequential_order,
    source_template_id, supplier_id,
    idempotency_key
  )
  VALUES (
    p_restaurant_id, v_template.name, v_template.description,
    'any', 'active', true, p_user_id, now(),
    'receiving', true,
    v_template.area_id, v_template.role_id, v_template.assigned_to_user_id,
    v_template.enforce_sequential_order,
    v_template.id, p_supplier_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_checklist;

  -- 4. Snapshot das tasks
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

  -- 5. Cria assumption já in_progress
  INSERT INTO public.checklist_assumptions (
    restaurant_id, checklist_id, user_id, user_name,
    date_key, assumed_at, execution_status
  )
  VALUES (
    p_restaurant_id, v_new_checklist, p_user_id, p_user_name,
    v_today, now(), 'in_progress'
  )
  RETURNING id INTO v_new_assumption;

  RETURN QUERY SELECT v_new_checklist, v_new_assumption, false;
END;
$$;

COMMENT ON FUNCTION public.instantiate_receiving_execution IS
  'Etapa 2 do refator de Recebimentos: cria execução one-shot a partir de um receiving_template. Transacional. Idempotente via idempotency_key. Auth/escopo são responsabilidade do caller (route handler TS).';


-- ===========================================================================
-- 2) replace_receiving_template_tasks
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.replace_receiving_template_tasks(
  p_template_id   uuid,
  p_restaurant_id uuid,
  p_tasks         jsonb         -- array de objetos task
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_exists boolean;
BEGIN
  -- Valida que template pertence ao restaurante
  SELECT EXISTS(
    SELECT 1 FROM public.receiving_templates
     WHERE id = p_template_id AND restaurant_id = p_restaurant_id
  ) INTO v_template_exists;

  IF NOT v_template_exists THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- DELETE tasks atuais
  DELETE FROM public.receiving_template_tasks
   WHERE template_id = p_template_id;

  -- INSERT novas tasks a partir do array JSONB
  INSERT INTO public.receiving_template_tasks (
    template_id, restaurant_id, title, description, "order",
    requires_photo, is_critical, requires_observation,
    type, max_photos, task_config
  )
  SELECT
    p_template_id,
    p_restaurant_id,
    (t->>'title')::text,
    NULLIF(t->>'description', '')::text,
    COALESCE((t->>'order')::int, 0),
    COALESCE((t->>'requires_photo')::boolean, false),
    COALESCE((t->>'is_critical')::boolean, false),
    COALESCE((t->>'requires_observation')::boolean, false),
    NULLIF(t->>'type', '')::text,
    NULLIF(t->>'max_photos', '')::int,
    CASE WHEN t->'task_config' IS NULL OR t->'task_config' = 'null'::jsonb
         THEN NULL ELSE t->'task_config' END
  FROM jsonb_array_elements(p_tasks) AS t;
END;
$$;

COMMENT ON FUNCTION public.replace_receiving_template_tasks IS
  'Substitui em bloco as tasks de um receiving_template (DELETE + INSERT atômico). Não toca execuções já criadas — snapshots em checklist_tasks permanecem.';

COMMIT;
