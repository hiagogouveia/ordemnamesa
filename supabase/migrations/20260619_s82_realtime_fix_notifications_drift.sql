-- ============================================================
-- Sprint 82 — Fase 0: corrigir drift de Realtime (notifications)
-- ============================================================
-- Diagnóstico: a publicação `supabase_realtime` está VAZIA no PROD (0 tabelas)
-- e contém apenas `notifications` no NONPROD. A migration s17 declarava
-- `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`, mas o estado
-- real divergiu (config provavelmente feita/perdida no painel, fora do versionamento).
--
-- Esta migration torna o estado REPRODUZÍVEL via código: garante que
-- `notifications` esteja publicada, sem depender do painel do Supabase.
--
-- Idempotente: só adiciona se ainda não for membro da publicação
-- (ALTER PUBLICATION ... ADD TABLE falha se a tabela já estiver publicada).
-- Aditiva: não altera RLS, schema, dados nem REPLICA IDENTITY.
--
-- ROLLBACK (rápido, sem perda de dados):
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;
