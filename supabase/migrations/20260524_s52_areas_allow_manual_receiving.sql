-- Sprint 52: controle por área de quem pode lançar recebimento manual
--
-- Adiciona flag em `areas` que controla se a área pode ver o botão
-- "Novo recebimento" no Meu Turno e iniciar recebimentos via templates
-- on-demand. Default false: nenhuma área pode até o owner ativar
-- explicitamente. Não afeta recebimentos recorrentes — apenas templates.

ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS allow_manual_receiving boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.areas.allow_manual_receiving IS
  'Se true, colaboradores desta área podem iniciar recebimentos manuais via "Novo recebimento" no Meu Turno. Não afeta recebimentos recorrentes materializados pelo cron.';
