-- Sprint 35 — Task Types (boolean / date / number / rating)
-- Reconstruída a partir do estado do NONPROD (version 20260430145223).
-- Idempotente: safe para re-execução.

-- ============================================================
-- checklist_tasks: novas colunas para tipos de resposta
-- ============================================================

ALTER TABLE checklist_tasks
  ADD COLUMN IF NOT EXISTS type TEXT NULL,
  ADD COLUMN IF NOT EXISTS requires_observation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_photos INTEGER NULL,
  ADD COLUMN IF NOT EXISTS task_config JSONB NULL;

ALTER TABLE checklist_tasks
  DROP CONSTRAINT IF EXISTS checklist_tasks_type_check;

ALTER TABLE checklist_tasks
  ADD CONSTRAINT checklist_tasks_type_check
  CHECK (type IS NULL OR type IN ('boolean', 'date', 'number', 'rating'));

ALTER TABLE checklist_tasks
  DROP CONSTRAINT IF EXISTS checklist_tasks_max_photos_check;

ALTER TABLE checklist_tasks
  ADD CONSTRAINT checklist_tasks_max_photos_check
  CHECK (max_photos IS NULL OR max_photos >= 1);

COMMENT ON COLUMN public.checklist_tasks.type IS
'Tipo de resposta da task. Valores: boolean (default), date, number, rating. NULL é tratado como boolean pela aplicação (compatibilidade com tasks antigas).';

COMMENT ON COLUMN public.checklist_tasks.requires_observation IS
'Quando true, exige campo de observação preenchido na execução para concluir.';

COMMENT ON COLUMN public.checklist_tasks.max_photos IS
'Quando requires_photo=true: limite máximo de fotos permitidas. NULL = sem limite. Mínimo é sempre 1 quando requires_photo=true.';

COMMENT ON COLUMN public.checklist_tasks.task_config IS
'Configurações específicas do tipo. Para number: { min_value?: number, max_value?: number }.';

-- ============================================================
-- task_executions: valores tipados + snapshot de config
-- ============================================================

ALTER TABLE task_executions
  ADD COLUMN IF NOT EXISTS value_boolean BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS value_date DATE NULL,
  ADD COLUMN IF NOT EXISTS value_number NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS value_rating SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS observation TEXT NULL,
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS has_alert BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS type_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS requires_observation_snapshot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_photos_snapshot INTEGER NULL,
  ADD COLUMN IF NOT EXISTS task_config_snapshot JSONB NULL;

ALTER TABLE task_executions
  DROP CONSTRAINT IF EXISTS task_executions_type_snapshot_check;

ALTER TABLE task_executions
  ADD CONSTRAINT task_executions_type_snapshot_check
  CHECK (type_snapshot IS NULL OR type_snapshot IN ('boolean', 'date', 'number', 'rating'));

ALTER TABLE task_executions
  DROP CONSTRAINT IF EXISTS task_executions_value_rating_check;

ALTER TABLE task_executions
  ADD CONSTRAINT task_executions_value_rating_check
  CHECK (value_rating IS NULL OR (value_rating >= 1 AND value_rating <= 5));

COMMENT ON COLUMN public.task_executions.photos IS
'Array JSONB de paths no Storage. Multi-foto. Mantido em paralelo com photo_url (legado). Leitura deve considerar ambos: se photos=[] e photo_url IS NOT NULL, usar photo_url.';

COMMENT ON COLUMN public.task_executions.has_alert IS
'Flag de alerta visual (não bloqueante). Computado server-side a partir do valor + config: date < hoje | number fora de [min, max] | rating <= 3.';

COMMENT ON COLUMN public.task_executions.type_snapshot IS
'Snapshot do tipo da task no momento da execução. Garante histórico imutável se admin trocar config posteriormente.';
