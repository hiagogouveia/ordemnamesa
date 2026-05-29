-- Sprint 58 — Idempotency key em checklists
-- Adiciona coluna nullable + partial unique index para deduplicar criação
-- de execuções one-shot via /api/receiving/instantiate (Etapa 2).
--
-- Decisão arquitetural: coluna no checklists (não tabela dedicada) é a
-- escolha mínima viável para 1 endpoint. Se outros endpoints precisarem
-- de idempotência no futuro, migrar para tabela `idempotency_keys`
-- dedicada (script de migração trivial).

BEGIN;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklists_idempotency_key
  ON public.checklists (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.checklists.idempotency_key IS
  'UUID gerado pelo cliente para deduplicar criação de execuções one-shot (clique duplo, retry, refresh). NULL em rows legadas. Se evoluir para múltiplos endpoints, migrar para tabela dedicada idempotency_keys.';

COMMIT;
