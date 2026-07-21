-- Sprint 94 — Transferência TEMPORÁRIA de responsável (férias, folga, atestado, cobertura)
--
-- Contexto: a transferência existente (POST /api/checklists/transfer-responsible) é
-- PERMANENTE — troca o vínculo e o original se perde. Férias/folga/atestado são
-- temporários: hoje o gestor troca à mão e precisa lembrar de desfazer. Não lembra.
--
-- ── DECISÃO CENTRAL: esta tabela é um LEDGER, não o caminho de leitura ────────
--
-- Quem responde "quem é o responsável AGORA" continua sendo `checklist_responsibles`
-- (s92) — o ponto único por onde passa TODA leitura de responsável no projeto
-- (lib/api/area-links.ts, lib/services/checklist-view.ts, lib/utils/checklist-visibility.ts).
-- O reconciliador (lib/api/temporary-transfer.ts) faz o swap lá; Meu Turno, Dashboard,
-- filtros, relatórios, exportações e audiência de notificações passam a refletir o
-- substituto SEM UMA LINHA DE MUDANÇA.
--
-- A alternativa — resolver "qual responsável vale hoje" dentro de cada consulta —
-- exigiria tocar todos esses caminhos, e qualquer um esquecido vira bug silencioso
-- de visibilidade (rotina aparecendo para quem está de férias).
--
-- Esta tabela guarda AGENDA + AUDITORIA: o que foi combinado, por quem, por quê, e
-- como terminou. Ela nunca é lida para decidir visibilidade.
--
-- ── Máquina de estados (vive na aplicação; sem trigger) ───────────────────────
--
--   scheduled --(starts_on <= hoje)--> active --(ends_on < hoje)--> ended/expired
--       |                                 |
--       +---------(cancelado)-------------+--> ended/cancelled | superseded
--                                                              | target_inactive
--
-- Deliberadamente SEM trigger: a transição precisa escrever em checklist_responsibles
-- e emitir auditoria, e a validação (turno, área, unidade) já vive na API. Um trigger
-- duplicaria a regra em plpgsql — a s92 já mostra o custo de manter lógica nos dois
-- lados (sombras + trigger de sombra + trigger de reparo).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checklist_temporary_transfers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  checklist_id       uuid NOT NULL REFERENCES public.checklists(id)  ON DELETE CASCADE,

  -- Para onde a rotina VOLTA no fim da janela. Congelado na criação: se o
  -- responsável original for trocado à mão no meio, a transferência é encerrada
  -- como 'superseded' (a edição manual vence) em vez de restaurar um valor obsoleto.
  original_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  temporary_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- ADR-1: granularidade de DIA, no fuso do restaurante. Ver COMMENT abaixo.
  starts_on          date NOT NULL,
  ends_on            date NOT NULL,

  status             text NOT NULL DEFAULT 'scheduled',
  ended_reason       text,

  -- ADR-3: por que a transferência COMEÇOU (opcional). Não afeta nenhuma regra.
  reason_code        text,
  reason_note        text,

  created_by         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  activated_at       timestamptz,
  ended_at           timestamptz,
  ended_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT ctt_status_check
    CHECK (status IN ('scheduled', 'active', 'ended')),

  CONSTRAINT ctt_ended_reason_check
    CHECK (ended_reason IS NULL OR ended_reason IN
      ('expired', 'cancelled', 'superseded', 'target_inactive')),

  -- Estado terminal sempre tem motivo; estado vivo nunca tem.
  CONSTRAINT ctt_ended_consistency
    CHECK ((status = 'ended') = (ended_reason IS NOT NULL)),

  CONSTRAINT ctt_window_check
    CHECK (ends_on >= starts_on),

  CONSTRAINT ctt_reason_code_check
    CHECK (reason_code IS NULL OR reason_code IN
      ('ferias', 'folga', 'atestado', 'treinamento', 'cobertura_turno', 'outro')),

  -- "Outro" sem nota é uma linha de auditoria inútil — é exatamente o caso em que
  -- o texto livre é a única informação existente.
  CONSTRAINT ctt_reason_note_required_for_outro
    CHECK (reason_code IS DISTINCT FROM 'outro' OR nullif(btrim(reason_note), '') IS NOT NULL),

  -- Substituir a pessoa por ela mesma não é transferência.
  CONSTRAINT ctt_distinct_users
    CHECK (original_user_id <> temporary_user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────────────────────

-- INVARIANTE MAIS IMPORTANTE DA TABELA: no máximo UMA transferência viva por rotina.
-- Sem isto, duas transferências sobrepostas gravariam original_user_id diferentes e a
-- segunda a expirar restauraria o responsável ERRADO — corrupção silenciosa e
-- irreversível (o original correto não existe mais em lugar nenhum).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctt_one_open
  ON public.checklist_temporary_transfers (checklist_id)
  WHERE status IN ('scheduled', 'active');

-- Varredura do reconciliador: só linhas vivas interessam. Parcial para não crescer
-- com o histórico, que é o que domina o volume com o tempo.
CREATE INDEX IF NOT EXISTS idx_ctt_open_window
  ON public.checklist_temporary_transfers (restaurant_id, status, starts_on, ends_on)
  WHERE status IN ('scheduled', 'active');

-- Histórico de uma rotina (GET da aba de auditoria), mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_ctt_checklist_created
  ON public.checklist_temporary_transfers (checklist_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. COMMENTs — carregam as decisões arquiteturais (ADRs) para dentro do schema
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.checklist_temporary_transfers IS
  's94 — LEDGER de transferências temporárias (agenda + auditoria). NÃO é caminho de leitura: '
  'quem é o responsável AGORA continua sendo checklist_responsibles (s92), escrita pelo '
  'reconciliador lib/api/temporary-transfer.ts. Nunca consultar esta tabela para decidir visibilidade.';

COMMENT ON COLUMN public.checklist_temporary_transfers.starts_on IS
  's94/ADR-1 — DATE, não timestamptz: interpretada no fuso do restaurante (restaurants.timezone). '
  'O domínio inteiro é datado por dia (date_key), e turnos que cruzam a meia-noite não existem no '
  'modelo (lib/utils/time-window.ts faz clamp em 23:59). Janela INCLUSIVA: starts_on <= hoje <= ends_on.';

COMMENT ON COLUMN public.checklist_temporary_transfers.ends_on IS
  's94/ADR-1 — DATE no fuso do restaurante; janela INCLUSIVA (o último dia ainda é do substituto). '
  's94/ADR-2 — NOT NULL por decisão de produto na v1. NULL está RESERVADO para "sem previsão de '
  'retorno" (licença indeterminada / até o gestor cancelar): a evolução é ALTER COLUMN DROP NOT NULL '
  '+ relaxar ctt_window_check. O reconciliador já é compatível — o predicado de expiração é '
  '"ends_on < hoje" e NULL nunca o satisfaz, então uma janela sem fim simplesmente nunca expira.';

COMMENT ON COLUMN public.checklist_temporary_transfers.status IS
  's94 — scheduled (criada, janela ainda não abriu) | active (substituto vigente em '
  'checklist_responsibles) | ended (terminal). Transições feitas pelo reconciliador e pelas rotas.';

COMMENT ON COLUMN public.checklist_temporary_transfers.ended_reason IS
  's94 — por que TERMINOU (não confundir com reason_code, que é por que COMEÇOU): '
  'expired = janela venceu (retorno automático) | cancelled = gestor encerrou antes do prazo | '
  'superseded = responsáveis trocados à mão durante a janela (a edição manual vence) | '
  'target_inactive = substituto foi desativado na unidade.';

COMMENT ON COLUMN public.checklist_temporary_transfers.reason_code IS
  's94/ADR-3 — por que COMEÇOU (não confundir com ended_reason, que é por que terminou). '
  'Opcional, puramente informativo: NÃO altera nenhuma regra de negócio. Existe como código '
  '(e não só texto livre) para permitir agregação — "quantas rotinas cobertas por férias no '
  'trimestre?". Vocabulário em português por ser conceito de negócio (mesmo padrão de '
  'template_kits.segment e kit_items.requirement_level, s72); discriminadores técnicos '
  '(status, ended_reason) seguem em inglês.';

COMMENT ON COLUMN public.checklist_temporary_transfers.reason_note IS
  's94/ADR-3 — nuance em texto livre. Obrigatória quando reason_code = ''outro'' (ver '
  'ctt_reason_note_required_for_outro), opcional nos demais casos.';

COMMENT ON COLUMN public.checklist_temporary_transfers.original_user_id IS
  's94 — para onde a rotina VOLTA. Congelado na criação; se os responsáveis forem trocados à mão '
  'durante a janela, a transferência é encerrada como ''superseded'' em vez de restaurar valor obsoleto.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — espelha exatamente checklist_responsibles (s92)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- As escritas reais acontecem via service_role nas rotas de API (que validam turno,
-- área, unidade e billing). Estas políticas são defesa em profundidade: garantem que
-- nenhum client autenticado leia transferências de outro tenant nem escreva direto.

ALTER TABLE public.checklist_temporary_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctt: membro ve" ON public.checklist_temporary_transfers;
CREATE POLICY "ctt: membro ve"
ON public.checklist_temporary_transfers FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "ctt: owner/manager gerencia" ON public.checklist_temporary_transfers;
CREATE POLICY "ctt: owner/manager gerencia"
ON public.checklist_temporary_transfers FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

GRANT ALL ON TABLE public.checklist_temporary_transfers TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS public.checklist_temporary_transfers CASCADE;
-- COMMIT;
--
-- Seguro: nenhuma outra tabela referencia esta, e a rotina volta a ter apenas o
-- responsável que estiver em checklist_responsibles no momento do rollback.
-- ATENÇÃO: transferências ATIVAS no momento do drop deixam o substituto gravado
-- permanentemente. Antes do rollback, encerre-as (restaurando os originais) com:
--   -- UPDATE public.checklist_responsibles cr
--   --    SET user_id = t.original_user_id
--   --   FROM public.checklist_temporary_transfers t
--   --  WHERE cr.checklist_id = t.checklist_id AND t.status = 'active';
