-- Sprint 48 — Receiving Routines (estrutura)
-- FASE 1: apenas fundação estrutural. Não altera comportamento operacional.
--
-- Adiciona em `checklists` os campos de configuração de recebimento e cria
-- a tabela `receiving_expectations` (instâncias esperadas a partir de rotinas
-- recurring). Comportamento das rotinas atuais é preservado: todos os campos
-- são opcionais e o `checklist_type='receiving'` já existe desde s6.
--
-- Próximas fases consumirão esta base (Meu Turno, inbox do gestor, alertas).

BEGIN;

-- ===========================================================================
-- PARTE 1 — Novos campos de configuração em `checklists`
-- ===========================================================================
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS receiving_mode       text NULL,
  ADD COLUMN IF NOT EXISTS receiving_generation text NULL,
  ADD COLUMN IF NOT EXISTS supplier_name        text NULL;

-- CHECKs idempotentes (drop+create para permitir re-run)
ALTER TABLE public.checklists
  DROP CONSTRAINT IF EXISTS checklists_receiving_mode_chk;
ALTER TABLE public.checklists
  ADD  CONSTRAINT checklists_receiving_mode_chk
  CHECK (receiving_mode IS NULL OR receiving_mode IN ('on_demand','recurring'));

ALTER TABLE public.checklists
  DROP CONSTRAINT IF EXISTS checklists_receiving_generation_chk;
ALTER TABLE public.checklists
  ADD  CONSTRAINT checklists_receiving_generation_chk
  CHECK (receiving_generation IS NULL OR receiving_generation IN ('automatic','manager_confirmation'));

COMMENT ON COLUMN public.checklists.receiving_mode IS
  'Aplicável quando checklist_type=receiving. on_demand = iniciado manualmente pelo colaborador; recurring = sistema materializa expectativas com base em recurrence/recurrence_config.';
COMMENT ON COLUMN public.checklists.receiving_generation IS
  'Aplicável quando receiving_mode=recurring. automatic = expectativa já nasce confirmada; manager_confirmation = expectativa nasce pending e exige aprovação do gestor.';
COMMENT ON COLUMN public.checklists.supplier_name IS
  'Texto livre opcional. Identifica origem do recebimento (ex: "Hortifruti CEASA"). NÃO é cadastro de fornecedor.';

-- ===========================================================================
-- PARTE 2 — Tabela receiving_expectations
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.receiving_expectations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id          uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  checklist_id           uuid NOT NULL REFERENCES public.checklists(id)  ON DELETE CASCADE,
  expected_date          date NOT NULL,
  expected_window_start  time NULL,
  expected_window_end    time NULL,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','overdue','cancelled')),
  assumption_id          uuid NULL REFERENCES public.checklist_assumptions(id) ON DELETE SET NULL,
  confirmed_by           uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at           timestamptz NULL,
  cancelled_reason       text NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, expected_date)
);

COMMENT ON TABLE public.receiving_expectations IS
  'Instâncias esperadas de recebimento, materializadas a partir de rotinas checklist_type=receiving e receiving_mode=recurring. UNIQUE(checklist_id, expected_date) garante idempotência da materialização.';

CREATE INDEX IF NOT EXISTS idx_recv_exp_rest_date
  ON public.receiving_expectations (restaurant_id, expected_date);

CREATE INDEX IF NOT EXISTS idx_recv_exp_open
  ON public.receiving_expectations (restaurant_id, status)
  WHERE status IN ('pending','overdue');

-- ===========================================================================
-- PARTE 3 — RLS (padrão s40: helper is_restaurant_member)
-- ===========================================================================
ALTER TABLE public.receiving_expectations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receiving_expectations: membro ve" ON public.receiving_expectations;
CREATE POLICY "receiving_expectations: membro ve"
ON public.receiving_expectations FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "receiving_expectations: owner/manager gerencia" ON public.receiving_expectations;
CREATE POLICY "receiving_expectations: owner/manager gerencia"
ON public.receiving_expectations FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- Fase 1: escrita restrita a owner/manager (regra acima). Staff só lê.
-- A transição staff (iniciar recebimento -> vincular assumption) virá em fase
-- posterior via API com service role, então não precisamos de policy de UPDATE
-- para staff neste momento.

COMMIT;
