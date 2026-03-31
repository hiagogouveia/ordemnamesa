-- Sprint 18: Limite de atividades simultâneas por área (por colaborador)
-- NULL = ilimitado, >= 1 = limite definido

ALTER TABLE areas
    ADD COLUMN IF NOT EXISTS max_parallel_tasks integer NULL;

-- Constraint: se definido, deve ser >= 1
ALTER TABLE areas
    ADD CONSTRAINT areas_max_parallel_tasks_check
    CHECK (max_parallel_tasks IS NULL OR max_parallel_tasks >= 1);

-- Índice para consulta de contagem de atividades in_progress por usuário/área
CREATE INDEX IF NOT EXISTS idx_checklist_assumptions_user_area_status
    ON checklist_assumptions (user_id, date_key, execution_status)
    WHERE execution_status = 'in_progress';
