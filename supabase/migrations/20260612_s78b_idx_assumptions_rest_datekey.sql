-- s78b: índice composto para as varreduras de auditoria/dashboard em
-- checklist_assumptions. As queries quentes filtram restaurant_id (sempre)
-- + range em date_key (relatórios: start/end; dashboard: últimos 7 dias).
-- Hoje só existe índice global em assumed_at — sem este, cada relatório
-- varre todas as assumptions do banco conforme o volume cresce.
-- Sem CONCURRENTLY de propósito: roda dentro da transação do migration
-- runner; com o volume atual o lock de escrita é desprezível.

CREATE INDEX IF NOT EXISTS idx_checklist_assumptions_rest_datekey
    ON public.checklist_assumptions (restaurant_id, date_key);
