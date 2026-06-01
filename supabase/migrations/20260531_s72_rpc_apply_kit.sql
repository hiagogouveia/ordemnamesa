-- ============================================================
-- Sprint 72 — RPCs de aplicação e desfazer de Kit
-- ============================================================
-- apply_kit: clona em LOTE (transação única) os modelos do kit nos
--   níveis pedidos, provisionando áreas (cria as inexistentes, reusa as
--   existentes por nome, nunca duplica) e deduplicando por origin_template_id.
-- undo_kit_application: remove apenas rotinas recém-aplicadas SEM histórico
--   (sem assumptions e sem task_executions). Rotinas já executadas são
--   protegidas. Invocadas server-side via service_role (após validação no API).
-- ============================================================

BEGIN;

-- p_extra_template_ids: opcionais selecionados individualmente no preview
-- (incluídos além dos níveis em p_levels). Default vazio.
DROP FUNCTION IF EXISTS public.apply_kit(uuid, uuid, uuid, text[], text);

CREATE OR REPLACE FUNCTION public.apply_kit(
  p_restaurant_id     uuid,
  p_user_id           uuid,
  p_kit_id            uuid,
  p_levels            text[],
  p_extra_template_ids uuid[] DEFAULT '{}',
  p_fallback_area     text   DEFAULT 'Geral'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tpl            record;
  v_area_id        uuid;
  v_label          text;
  v_new_id         uuid;
  v_created_ids    uuid[] := '{}';
  v_skipped        uuid[] := '{}';
  v_created_areas  uuid[] := '{}';
BEGIN
  FOR v_tpl IN
    SELECT ct.id, ct.name, ct.description, ct.suggested_type, ct.suggested_recurrence,
           ct.suggested_recurrence_config, ct.suggested_area_label, ct.version
    FROM public.template_kit_items ki
    JOIN public.checklist_templates ct ON ct.id = ki.template_id
    WHERE ki.kit_id = p_kit_id
      AND ct.is_active = true
      AND (ki.requirement_level = ANY(p_levels) OR ki.template_id = ANY(p_extra_template_ids))
    ORDER BY ki.sort_order
  LOOP
    -- DEDUPE: pular se já existe rotina não-arquivada vinda deste modelo
    IF EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.restaurant_id = p_restaurant_id
        AND c.origin_template_id = v_tpl.id
        AND c.status <> 'archived'
        AND COALESCE(c.is_one_shot, false) = false
    ) THEN
      v_skipped := array_append(v_skipped, v_tpl.id);
      CONTINUE;
    END IF;

    -- PROVISÃO DE ÁREA: match case-insensitive; cria só se não existir
    v_label := COALESCE(NULLIF(btrim(v_tpl.suggested_area_label), ''), p_fallback_area);
    SELECT a.id INTO v_area_id
    FROM public.areas a
    WHERE a.restaurant_id = p_restaurant_id
      AND lower(btrim(a.name)) = lower(btrim(v_label))
    LIMIT 1;

    IF v_area_id IS NULL THEN
      INSERT INTO public.areas (restaurant_id, name)
      VALUES (p_restaurant_id, v_label)
      RETURNING id INTO v_area_id;
      v_created_areas := array_append(v_created_areas, v_area_id);
    END IF;

    -- CLONE do checklist (cópia congelada, independente)
    INSERT INTO public.checklists (
      restaurant_id, name, description, shift, shift_id, status,
      is_required, checklist_type, recurrence, recurrence_config,
      enforce_sequential_order, area_id, target_role, assignment_type,
      active, created_by, origin_template_id, origin_template_version, origin_kit_id
    ) VALUES (
      p_restaurant_id, v_tpl.name, v_tpl.description, 'any', NULL, 'active',
      true, COALESCE(v_tpl.suggested_type, 'regular'),
      COALESCE(v_tpl.suggested_recurrence, 'daily'), v_tpl.suggested_recurrence_config,
      false, v_area_id, 'all', 'area',
      true, p_user_id, v_tpl.id, v_tpl.version, p_kit_id
    ) RETURNING id INTO v_new_id;

    -- CLONE das tasks
    INSERT INTO public.checklist_tasks (
      checklist_id, restaurant_id, title, description, "order",
      requires_photo, is_critical, requires_observation, type, max_photos, task_config
    )
    SELECT v_new_id, p_restaurant_id, i.title, i.description, i."order",
           i.requires_photo, i.is_critical, i.requires_observation, i.type, i.max_photos, i.task_config
    FROM public.checklist_template_items i
    WHERE i.template_id = v_tpl.id;

    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created_count',         COALESCE(array_length(v_created_ids, 1), 0),
    'created_checklist_ids', to_jsonb(v_created_ids),
    'skipped_count',         COALESCE(array_length(v_skipped, 1), 0),
    'skipped_template_ids',  to_jsonb(v_skipped),
    'created_area_ids',      to_jsonb(v_created_areas)
  );
END $$;

COMMENT ON FUNCTION public.apply_kit(uuid, uuid, uuid, text[], uuid[], text) IS
  'Aplica um kit: clona modelos (níveis pedidos + opcionais individuais) em checklists do tenant, provisiona áreas e deduplica por origin_template_id. Transação única.';


CREATE OR REPLACE FUNCTION public.undo_kit_application(
  p_restaurant_id uuid,
  p_checklist_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_deletable     uuid[];
  v_deleted_count int := 0;
  v_requested     int := COALESCE(array_length(p_checklist_ids, 1), 0);
BEGIN
  -- Só remove: do restaurante, originada de kit e SEM histórico de execução
  SELECT array_agg(c.id) INTO v_deletable
  FROM public.checklists c
  WHERE c.id = ANY(p_checklist_ids)
    AND c.restaurant_id = p_restaurant_id
    AND c.origin_kit_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.checklist_assumptions a WHERE a.checklist_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.task_executions te     WHERE te.checklist_id = c.id);

  IF v_deletable IS NULL THEN
    RETURN jsonb_build_object('deleted_count', 0, 'protected_count', v_requested, 'deleted_ids', '[]'::jsonb);
  END IF;

  DELETE FROM public.checklists WHERE id = ANY(v_deletable);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count',   v_deleted_count,
    'protected_count', v_requested - v_deleted_count,
    'deleted_ids',     to_jsonb(v_deletable)
  );
END $$;

COMMENT ON FUNCTION public.undo_kit_application(uuid, uuid[]) IS
  'Desfaz aplicação de kit: remove apenas rotinas recém-criadas SEM histórico. Rotinas já executadas são protegidas.';

COMMIT;
