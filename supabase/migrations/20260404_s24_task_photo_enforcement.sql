-- Sprint 24 — Exigência de foto por task na execução
-- Adiciona photo_url e requires_photo_snapshot a task_executions
-- Garante consistência histórica sem depender de join com checklist_tasks

ALTER TABLE task_executions
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS requires_photo_snapshot boolean NOT NULL DEFAULT false;

-- Constraint: task concluída (done) que exige foto DEVE ter photo_url
-- Só aplica ao status 'done' para não bloquear registros 'doing'/'skipped'/'flagged'
ALTER TABLE task_executions
  DROP CONSTRAINT IF EXISTS check_required_photo;

ALTER TABLE task_executions
  ADD CONSTRAINT check_required_photo
  CHECK (
    NOT (
      requires_photo_snapshot = true
      AND status = 'done'
      AND photo_url IS NULL
    )
  );
