-- Sprint 26: Corrigir integridade de execution_status
-- Problema: o endpoint /complete setava completed_at mas NÃO execution_status='done'
-- Resultado: assumptions com completed_at preenchido mas execution_status='in_progress'

-- 1. Backfill: corrigir registros históricos inconsistentes
UPDATE checklist_assumptions
SET execution_status = 'done'
WHERE completed_at IS NOT NULL
  AND execution_status != 'done';

-- 2. Constraint: impedir futuras inconsistências
-- Se execution_status='done', completed_at deve existir (e vice-versa)
ALTER TABLE checklist_assumptions
    ADD CONSTRAINT chk_done_requires_completed_at
    CHECK (
        (execution_status != 'done' OR completed_at IS NOT NULL)
        AND
        (completed_at IS NULL OR execution_status = 'done')
    );
