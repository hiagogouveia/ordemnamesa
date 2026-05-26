-- Sprint 50 — Remoção do sistema legado de Compras
-- Substituído por receiving_expectations (s48) + fluxo de Recebimentos (s48-s49).
--
-- Tabelas dropadas (CASCADE remove policies, FKs e índices vinculados):
--   purchase_items (referencia purchase_lists.id)
--   purchase_lists (não é referenciada por nenhuma outra tabela; auditado em s50)
--
-- A coluna roles.can_launch_purchases é MANTIDA como flag dormente para
-- evitar refactor cross-tela (form de cargos em configuracoes ainda lê/grava).
-- Pode ser removida em sprint dedicada se desejado.

BEGIN;

DROP TABLE IF EXISTS public.purchase_items CASCADE;
DROP TABLE IF EXISTS public.purchase_lists CASCADE;

COMMIT;
