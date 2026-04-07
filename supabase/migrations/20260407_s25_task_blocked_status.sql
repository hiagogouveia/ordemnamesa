-- Sprint 25: Impedimento no nível da task
-- Permite que colaboradores reportem problemas em tarefas individuais
-- O status "Com impedimento" da rotina é derivado das tasks bloqueadas

-- 1. Adicionar coluna checklist_assumption_id (FK para escopar execuções à assumption ativa)
ALTER TABLE task_executions
    ADD COLUMN IF NOT EXISTS checklist_assumption_id uuid REFERENCES checklist_assumptions(id) ON DELETE SET NULL;

-- 2. Adicionar colunas de bloqueio
ALTER TABLE task_executions
    ADD COLUMN IF NOT EXISTS blocked_reason text,
    ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
    ADD COLUMN IF NOT EXISTS blocked_by_user_id uuid REFERENCES users(id);

-- 3. Atualizar CHECK constraint de status para incluir 'blocked'
-- Primeiro dropar a constraint existente, depois recriar
ALTER TABLE task_executions
    DROP CONSTRAINT IF EXISTS task_executions_status_check;

ALTER TABLE task_executions
    ADD CONSTRAINT task_executions_status_check
    CHECK (status IN ('done', 'skipped', 'flagged', 'doing', 'blocked'));

-- 4. Atualizar constraint de photo enforcement para não bloquear tasks bloqueadas
ALTER TABLE task_executions
    DROP CONSTRAINT IF EXISTS task_executions_photo_enforcement;

ALTER TABLE task_executions
    ADD CONSTRAINT task_executions_photo_enforcement
    CHECK (
        NOT (
            requires_photo_snapshot = true
            AND status = 'done'
            AND photo_url IS NULL
        )
    );

-- 5. Índice para queries de derivação de status
CREATE INDEX IF NOT EXISTS idx_te_assumption
    ON task_executions(checklist_assumption_id)
    WHERE status = 'blocked';

-- 6. Constraint: blocked_reason obrigatório quando status = 'blocked'
ALTER TABLE task_executions
    ADD CONSTRAINT task_executions_blocked_reason_required
    CHECK (
        status != 'blocked' OR blocked_reason IS NOT NULL
    );
