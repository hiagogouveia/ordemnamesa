-- Sprint 15: Adicionar execution_status + blocked_reason à checklist_assumptions
-- NOT_STARTED = nenhuma linha existe para o dia (derivado)
-- OVERDUE     = derivado dinamicamente no frontend (end_time + hora atual)

ALTER TABLE checklist_assumptions
    ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'in_progress'
        CHECK (execution_status IN ('in_progress', 'blocked', 'done'));

ALTER TABLE checklist_assumptions
    ADD COLUMN IF NOT EXISTS blocked_reason text;

-- Backfill: linhas que já têm completed_at devem ter status 'done'
UPDATE checklist_assumptions
SET execution_status = 'done'
WHERE completed_at IS NOT NULL
  AND execution_status != 'done';

-- Índice para acelerar lookup por restaurant + data (query diária do gestor)
CREATE INDEX IF NOT EXISTS idx_checklist_assumptions_restaurant_date
    ON checklist_assumptions(restaurant_id, date_key);
