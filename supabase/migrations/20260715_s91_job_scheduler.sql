-- Sprint 91 — Scheduler de jobs interno (substitui o cron via GitHub Actions)
--
-- Contexto: os jobs agendados viviam em workflows do GitHub Actions batendo em
-- endpoints HTTP públicos. Isso os deixava FORA da infraestrutura — uma VPS nova subia
-- sem job nenhum. Agora um worker residente (mesmo container da app) executa os jobs,
-- e o AGENDAMENTO passa a ser dirigido pelo banco.
--
-- ── Divisão de responsabilidade (deliberada) ──────────────────────────────────
-- A DEFINIÇÃO do job (intervalo, timeout, handler) vive no CÓDIGO (lib/jobs/registry.ts):
-- versionada, tipada, revisada em PR. O BANCO guarda só ESTADO e HISTÓRICO. Config no
-- banco viraria drift entre ambientes e ficaria fora do git.
--
-- Duas tabelas, não três: estado e lock moram juntos (uma linha por job).

BEGIN;

-- ============================================================================
-- job_state — uma linha por job. Estado do scheduler + lease distribuído.
-- ============================================================================
-- Semeada pela aplicação (upsert idempotente) a partir do JOB_REGISTRY no boot do
-- worker — NÃO por seed SQL, para que o banco nunca seja fonte da lista de jobs.
CREATE TABLE IF NOT EXISTS public.job_state (
    job_name text PRIMARY KEY,

    -- O ÚNICO controle operacional no banco: desligar um job em incidente NÃO pode
    -- exigir deploy. Tudo o mais (intervalo, timeout) vive no código.
    enabled boolean NOT NULL DEFAULT true,

    -- Cursor do scheduler: quando o job rodou (com sucesso OU não) pela última vez.
    last_run_at timestamptz,
    -- Última vez que TERMINOU COM SUCESSO — é isto que o dead-man's-switch observa.
    last_success_at timestamptz,

    -- Lease distribuído. Um UPDATE atômico decide o vencedor entre N workers.
    -- (advisory lock não serve aqui: é session-scoped e o pooler devolve conexões
    --  arbitrárias via PostgREST — o lock seria adquirido numa conexão e solto noutra.)
    --
    -- `locked_until` nasce no passado (= LIVRE), NUNCA NULL. Motivo: a aquisição do lease
    -- filtra por `locked_until < now`, e um `.or(...is.null)` no PostgREST dispara um bug
    -- ("column does not exist") dentro de UPDATE. Com o sentinela, "livre" é sempre uma
    -- comparação de data — sem OR. Ver lib/jobs/lease.ts (FREE_SENTINEL).
    locked_by text,
    locked_until timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',

    -- Backoff: após N falhas seguidas, o scheduler espaça as tentativas (não marreta
    -- um job quebrado a cada minuto), mas o dead-man's-switch continua reportando.
    consecutive_failures int NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- job_runs — histórico. SÓ execuções significativas.
-- ============================================================================
-- Execução no-op (job rodou e não achou nada — o caso comum do outbox) NÃO vira linha:
-- só atualiza job_state.last_run_at. Isso elimina ~95% do volume e torna job_runs
-- LEGÍVEL — cada linha é um fato que aconteceu.
CREATE TABLE IF NOT EXISTS public.job_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name text NOT NULL,
    worker_id text NOT NULL,

    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,

    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'failed', 'timeout', 'interrupted')),

    items_processed int,
    error text,

    created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta do painel/health: as execuções recentes de um job.
CREATE INDEX IF NOT EXISTS idx_job_runs_job_started
    ON public.job_runs (job_name, started_at DESC);

-- Reclaim no boot: achar as `running` orfãs (worker morto no meio) para marcá-las
-- `interrupted`. Parcial porque só as `running` interessam.
CREATE INDEX IF NOT EXISTS idx_job_runs_running
    ON public.job_runs (started_at)
    WHERE status = 'running';

-- Retenção (parte do notifications-retention): varre por status + data.
CREATE INDEX IF NOT EXISTS idx_job_runs_status_created
    ON public.job_runs (status, created_at);

-- ============================================================================
-- RLS — só service_role, como domain_events.
-- ============================================================================
-- O worker e os health endpoints acessam via service_role (server-side). Nada de
-- job scheduling é exposto a anon/authenticated.
ALTER TABLE public.job_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_state FROM anon, authenticated;
REVOKE ALL ON public.job_runs  FROM anon, authenticated;

-- Trigger de updated_at em job_state (padrão do projeto).
CREATE OR REPLACE FUNCTION public.set_job_state_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_state_set_updated_at ON public.job_state;
CREATE TRIGGER job_state_set_updated_at
    BEFORE UPDATE ON public.job_state
    FOR EACH ROW EXECUTE FUNCTION public.set_job_state_updated_at();

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS job_state_set_updated_at ON public.job_state;
--   DROP FUNCTION IF EXISTS public.set_job_state_updated_at();
--   DROP TABLE IF EXISTS public.job_runs;
--   DROP TABLE IF EXISTS public.job_state;
-- COMMIT;
