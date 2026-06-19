-- ============================================================
-- Sprint 82 — Fase 1: publicar checklist_assumptions no Realtime
-- ============================================================
-- Objetivo: reativar a sincronização ao vivo da ASSUNÇÃO/FINALIZAÇÃO de rotinas
-- (checklist_assumptions.completed_at) entre usuários, com o MENOR risco possível.
--
-- Por que esta tabela primeiro (e só ela nesta fase):
--   - Sem DELETE físico no fluxo (apenas INSERT ao assumir + UPDATE ao finalizar)
--     => REPLICA IDENTITY DEFAULT já basta: INSERT/UPDATE entregam o NEW completo
--        e a RLS é avaliada corretamente. NÃO é necessário REPLICA IDENTITY FULL.
--   - SELECT liberada a todos os membros do restaurante (is_restaurant_member),
--     então o evento propaga para colaboradores e gestores do mesmo tenant.
--   - Volume baixíssimo (dezenas de escritas/dia) => impacto desprezível em WAL/CPU.
--
-- Escopo: NÃO altera task_executions, task_issues, RLS, schema, dados nem
-- REPLICA IDENTITY de nenhuma tabela. Puramente aditiva à publicação.
--
-- Idempotente: só adiciona se ainda não for membro da publicação.
--
-- ROLLBACK (rápido, sem perda de dados):
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.checklist_assumptions;
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'checklist_assumptions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_assumptions;
    END IF;
END $$;
