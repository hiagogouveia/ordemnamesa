-- Sprint 90 — Central de Notificações: contrato tipado + outbox de eventos de domínio
--
-- FASE 0 (dark): migration puramente ADITIVA. Nenhum código lê as estruturas novas
-- ainda. O app existente continua funcionando exatamente como antes.
--
-- Contexto (auditoria):
--   * `notifications.metadata` é write-only e `related_id` é um TEXT sem tipo de
--     entidade — não dá para construir deep-link determinístico a partir deles.
--   * O CHECK de `type` já custou 5 migrations e mesmo assim deixou 'BLOCKED_ROUTINE'
--     de fora (produziu drift, não integridade). Com o INSERT fechado por RLS (s38) e
--     um único escritor tipado, o CHECK só protege contra o próprio código — e o
--     TypeScript faz isso melhor e mais cedo.
--   * `authenticated` tem GRANT de UPDATE em TODAS as colunas e a policy RLS permite
--     UPDATE nas próprias linhas ⇒ um usuário pode reescrever o `type`/`title`/
--     `metadata` da própria notificação via PostgREST. Não é escalação de privilégio
--     (o destino revalida acesso no servidor), mas quebra imutabilidade e auditoria.
--
-- ROLLBACK: ver bloco no final do arquivo.

BEGIN;

-- ===========================================================================
-- 1. domain_events — outbox de eventos de domínio (generaliza o padrão do s87)
-- ===========================================================================
-- A notificação passa a ser CONSEQUÊNCIA de um evento, nunca lógica inline.
-- UNIQUE(event_type, dedup_key) dá idempotência de graça: retry de rota,
-- double-submit e cron sobreposto colidem no índice e viram no-op.

CREATE TABLE IF NOT EXISTS public.domain_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    restaurant_id uuid NOT NULL
        REFERENCES public.restaurants(id) ON DELETE CASCADE,

    event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 64),
    -- Identidade do FATO DE NEGÓCIO. Determinística, derivada do domínio.
    -- Ex.: 'issue:<issue_id>', 'delayed:<checklist_id>:<date_key>'.
    dedup_key text NOT NULL CHECK (char_length(dedup_key) BETWEEN 1 AND 200),

    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload_version int NOT NULL DEFAULT 1,

    actor_user_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),

    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processed', 'failed')),
    attempts int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 5,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),

    processed_at timestamptz,
    last_error text,

    created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotência: o banco é o árbitro, não a aplicação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_dedup
    ON public.domain_events (event_type, dedup_key);

-- Varredura do cron por pendências elegíveis (rede de segurança do fast-path inline).
CREATE INDEX IF NOT EXISTS idx_domain_events_pending
    ON public.domain_events (next_attempt_at)
    WHERE status IN ('pending', 'failed');

-- Retenção (F9) varre por status + data.
CREATE INDEX IF NOT EXISTS idx_domain_events_status_created
    ON public.domain_events (status, created_at);

-- RLS habilitada SEM policies ⇒ inacessível a anon/authenticated.
-- Escrita e leitura só via service_role. Append-only por construção.
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.domain_events FROM anon, authenticated;


-- ===========================================================================
-- 2. notifications — colunas do contrato tipado
-- ===========================================================================
-- `metadata` e `related_id` são PRESERVADOS: o dropdown atual ainda lê deles, e
-- haverá dual-write durante a transição para que um rollback do frontend não
-- perca o comportamento de clique.

ALTER TABLE public.notifications
    -- Payload tipado: SÓ IDs. É o que o resolver de navegação consome.
    ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS payload_version int NOT NULL DEFAULT 1,

    -- Correlation id de ponta a ponta: 1 evento → N notificações (fan-out),
    -- todas compartilhando o mesmo event_id. Costura emit → click → navegação.
    ADD COLUMN IF NOT EXISTS event_id uuid
        REFERENCES public.domain_events(id) ON DELETE SET NULL,

    ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('critical', 'high', 'normal', 'low')),

    -- Chave de agrupamento, computada no emit (determinística, persistida).
    -- O cliente só agrupa por igualdade — nunca inventa lógica de agrupamento.
    ADD COLUMN IF NOT EXISTS group_key text,

    ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Ordenação por prioridade ANTES do horário, indexável. Coluna gerada para que a
-- ordenação seja um índice, não um CASE avaliado por linha.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS priority_rank smallint
        GENERATED ALWAYS AS (
            CASE priority
                WHEN 'critical' THEN 0
                WHEN 'high'     THEN 1
                WHEN 'normal'   THEN 2
                ELSE 3
            END
        ) STORED;

-- Segunda linha de defesa contra duplicata no fan-out: mesmo se um evento for
-- processado duas vezes, o destinatário não recebe duas cópias.
-- Parcial porque as linhas legadas têm event_id NULL (e várias por usuário).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_user
    ON public.notifications (event_id, user_id)
    WHERE event_id IS NOT NULL;

-- O padrão de acesso REAL do GET (restaurant + user + não-lidas + prioridade + data)
-- não tinha índice. Os 4 índices do s17 não cobrem essa combinação.
CREATE INDEX IF NOT EXISTS idx_notifications_user_rest_rank
    ON public.notifications (user_id, restaurant_id, read, priority_rank, created_at DESC);


-- ===========================================================================
-- 3. Escalabilidade do tipo: o CHECK sai
-- ===========================================================================
-- Adicionar um tipo deixa de exigir ALTER TABLE. A garantia migra para o
-- TypeScript (mapas exaustivos que quebram o build) + assertEmittableType()
-- antes do insert. O INSERT já está fechado por RLS desde o s38: o único
-- escritor é o service_role, por um único caminho tipado.

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_nonempty
    CHECK (char_length(type) BETWEEN 1 AND 64);


-- ===========================================================================
-- 4. IMUTABILIDADE — fecha o furo de integridade
-- ===========================================================================
-- Antes: `authenticated` tinha GRANT de UPDATE em todas as colunas e a policy
-- "Users can update own notifications" (USING auth.uid() = user_id) autorizava.
-- Resultado: um usuário podia reescrever type/title/payload da própria notificação.
--
-- Depois: só `read` e `read_at` são mutáveis. Tudo o mais é imutável APÓS A CRIAÇÃO,
-- por PRIVILÉGIO DE COLUNA — a garantia vive no banco, não na disciplina do código.
-- Privilégio de coluna é a ferramenta exata aqui (declarativo, sem trigger).
--
-- INSERT/DELETE: já eram barrados pela ausência de policy RLS (s38). O REVOKE
-- torna a intenção explícita e falha com 42501 em vez de depender do RLS.
-- `expectRlsDenied` (tests/security/helpers/assertions.ts) aceita 42501.

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

GRANT UPDATE (read, read_at) ON public.notifications TO authenticated;

-- Nota: a policy RLS de UPDATE continua necessária e válida — ela garante
-- "só as MINHAS linhas". O grant de coluna garante "só ESTAS colunas".
-- As duas juntas: um usuário só marca como lida a própria notificação.


-- ===========================================================================
-- 5. notifications.user_id — FK ausente desde o s17 (permitia órfãos)
-- ===========================================================================
-- Limpa órfãos antes de impor a FK (idempotente; normalmente 0 linhas).

DELETE FROM public.notifications n
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = n.user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notifications_user_id_fkey'
          AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;


-- ===========================================================================
-- 6. task_issues.severity — separa Impedimento de Ocorrência
-- ===========================================================================
-- A coluna existe reservada desde o s45 e nunca foi usada (zero leituras/escritas
-- em API, hooks e componentes). É o gancho para distinguir os dois conceitos SEM
-- tabela nova — o s45 deliberadamente unificou "impedimento" e "ocorrência" em
-- task_issues quando removeu o status 'blocked'.
--
-- 'blocker' = trava a operação (era o antigo status 'blocked').
-- 'normal'  = ocorrência operacional comum.

UPDATE public.task_issues SET severity = 'normal' WHERE severity IS NULL;

ALTER TABLE public.task_issues
    ALTER COLUMN severity SET DEFAULT 'normal';

ALTER TABLE public.task_issues
    ALTER COLUMN severity SET NOT NULL;

ALTER TABLE public.task_issues
    DROP CONSTRAINT IF EXISTS task_issues_severity_check;

ALTER TABLE public.task_issues
    ADD CONSTRAINT task_issues_severity_check
    CHECK (severity IN ('normal', 'blocker'));

-- O deep-link de um impedimento aberto precisa achar a ocorrência rápido por rotina+status.
CREATE INDEX IF NOT EXISTS idx_task_issues_checklist_severity
    ON public.task_issues (checklist_id, severity)
    WHERE status IN ('open', 'investigating');

COMMIT;


-- ===========================================================================
-- ROLLBACK (sem perda de dados de negócio)
-- ===========================================================================
-- BEGIN;
--   -- restaura os grants amplos do Supabase (estado anterior)
--   GRANT INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
--
--   ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_nonempty;
--   ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
--       'TASK_COMPLETED_WITH_NOTE'::text, 'NEW_TASK_ASSIGNED'::text,
--       'NEW_TASK_FOR_AREA'::text, 'PASSWORD_CHANGED_BY_ADMIN'::text]));
--
--   DROP INDEX IF EXISTS public.idx_notifications_user_rest_rank;
--   DROP INDEX IF EXISTS public.idx_notifications_event_user;
--   ALTER TABLE public.notifications
--       DROP COLUMN IF EXISTS priority_rank,
--       DROP COLUMN IF EXISTS read_at,
--       DROP COLUMN IF EXISTS group_key,
--       DROP COLUMN IF EXISTS priority,
--       DROP COLUMN IF EXISTS event_id,
--       DROP COLUMN IF EXISTS payload_version,
--       DROP COLUMN IF EXISTS payload;
--   ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
--
--   DROP INDEX IF EXISTS public.idx_task_issues_checklist_severity;
--   ALTER TABLE public.task_issues DROP CONSTRAINT IF EXISTS task_issues_severity_check;
--   ALTER TABLE public.task_issues ALTER COLUMN severity DROP NOT NULL;
--   ALTER TABLE public.task_issues ALTER COLUMN severity DROP DEFAULT;
--
--   DROP TABLE IF EXISTS public.domain_events;  -- notifications.event_id vira NULL (ON DELETE SET NULL)
-- COMMIT;
