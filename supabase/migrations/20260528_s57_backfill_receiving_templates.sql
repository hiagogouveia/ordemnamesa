-- Sprint 57 — Backfill de receiving_templates a partir de checklists legados
-- Migra checklists com checklist_type='receiving' AND receiving_mode='recurring'
-- (que hoje funcionam como template + fonte de materialização) para a nova
-- tabela receiving_templates + receiving_template_tasks.
--
-- Os checklists originais são marcados active=false (não somem — preservam
-- histórico de receiving_expectations e checklist_assumptions já criados).
--
-- Idempotente: usa NOT EXISTS para não duplicar caso seja re-executado.

BEGIN;

-- ===========================================================================
-- PARTE 1 — Copia receiving recurring checklists para receiving_templates
-- ===========================================================================
WITH inserted_templates AS (
  INSERT INTO public.receiving_templates (
    id,
    restaurant_id,
    name,
    description,
    area_id,
    role_id,
    assigned_to_user_id,
    shift,
    recurrence,
    recurrence_config,
    enforce_sequential_order,
    active,
    created_at,
    created_by
  )
  SELECT
    gen_random_uuid()           AS id,
    c.restaurant_id,
    c.name,
    c.description,
    c.area_id,
    c.role_id,
    c.assigned_to_user_id,
    CASE WHEN c.shift::text IN ('morning','afternoon','evening')
         THEN c.shift::text
         ELSE NULL
    END                         AS shift,
    COALESCE(c.recurrence, 'daily') AS recurrence,
    c.recurrence_config,
    COALESCE(c.enforce_sequential_order, false),
    c.active,
    c.created_at,
    c.created_by
  FROM public.checklists c
  WHERE c.checklist_type = 'receiving'
    AND c.receiving_mode = 'recurring'
    AND NOT EXISTS (
      -- evita reprocessar checklists que já foram migrados em rodada anterior
      SELECT 1 FROM public.receiving_templates t
      WHERE t.restaurant_id = c.restaurant_id
        AND t.name = c.name
        AND t.area_id = c.area_id
    )
  RETURNING id, restaurant_id, name, area_id
),
-- mapeia template recém-criado de volta para o checklist origem
mapping AS (
  SELECT
    c.id  AS checklist_id,
    t.id  AS template_id
  FROM public.checklists c
  JOIN inserted_templates t
    ON t.restaurant_id = c.restaurant_id
   AND t.name = c.name
   AND t.area_id = c.area_id
  WHERE c.checklist_type = 'receiving'
    AND c.receiving_mode = 'recurring'
)
-- ===========================================================================
-- PARTE 2 — Copia tasks dos checklists migrados para receiving_template_tasks
-- ===========================================================================
INSERT INTO public.receiving_template_tasks (
  template_id,
  restaurant_id,
  title,
  description,
  "order",
  requires_photo,
  is_critical,
  requires_observation,
  type,
  max_photos,
  task_config
)
SELECT
  m.template_id,
  ct.restaurant_id,
  ct.title,
  ct.description,
  COALESCE(ct."order", 0),
  COALESCE(ct.requires_photo, false),
  COALESCE(ct.is_critical, false),
  COALESCE(ct.requires_observation, false),
  ct.type,
  ct.max_photos,
  ct.task_config
FROM mapping m
JOIN public.checklist_tasks ct ON ct.checklist_id = m.checklist_id;

-- ===========================================================================
-- PARTE 3 — Desativa checklists legados que foram migrados
-- ===========================================================================
-- Não deletamos para preservar histórico (receiving_expectations já criadas,
-- checklist_assumptions, relatórios). Apenas paramos de exibi-los.
UPDATE public.checklists c
SET active = false
WHERE c.checklist_type = 'receiving'
  AND c.receiving_mode = 'recurring'
  AND c.active = true
  AND EXISTS (
    SELECT 1 FROM public.receiving_templates t
    WHERE t.restaurant_id = c.restaurant_id
      AND t.name = c.name
      AND t.area_id = c.area_id
  );

COMMIT;
