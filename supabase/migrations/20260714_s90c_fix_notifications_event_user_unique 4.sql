-- Sprint 90c — corrige o índice de dedup do fan-out de notificações.
--
-- CONTEXTO: a primeira versão do s90 criou `idx_notifications_event_user` como índice
-- PARCIAL (`WHERE event_id IS NOT NULL`). Isso o torna inutilizável num ON CONFLICT
-- via PostgREST: o Postgres exige que o predicado do índice parcial seja informado na
-- cláusula, e o PostgREST não tem como expressá-lo. O upsert do materializador falhava
-- com "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- (A falha foi detectada porque o outbox REGISTROU o erro em `domain_events.last_error`
--  em vez de engoli-lo — exatamente o que o desenho previa.)
--
-- O parcial era desnecessário: no Postgres, NULLs são DISTINTOS por padrão
-- (NULLS DISTINCT), então um UNIQUE(event_id, user_id) simples já permite N linhas
-- legadas (event_id NULL) para o mesmo usuário — que era a única razão do WHERE.
--
-- Idempotente. O arquivo do s90 já foi corrigido, então numa base nova esta migration
-- é um no-op (dropa e recria o índice idêntico).
--
-- ROLLBACK: nenhum necessário — o índice correto é superset funcional do anterior.

BEGIN;

DROP INDEX IF EXISTS public.idx_notifications_event_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_user
    ON public.notifications (event_id, user_id);

COMMIT;
