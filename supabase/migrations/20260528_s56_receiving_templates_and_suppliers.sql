-- Sprint 56 — Receiving Templates + Suppliers (estrutura)
-- Refatoração arquitetural: separa template de recebimento (blueprint) da
-- execução operacional (checklists + checklist_assumptions). Introduz cadastro
-- de fornecedores como entidade do tenant.
--
-- FASE Etapa 0 do plano: apenas fundação estrutural. Não altera comportamento.
-- Modelos antigos (checklists com receiving_mode=recurring) continuam vivos até
-- o backfill em s57 e a migração das telas em etapas posteriores.

BEGIN;

-- ===========================================================================
-- PARTE 1 — Tabela suppliers
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  cnpj          text NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (restaurant_id, name)
);

COMMENT ON TABLE public.suppliers IS
  'Fornecedores do restaurante. Usado em execuções de recebimento para identificar quem entregou.';

CREATE INDEX IF NOT EXISTS idx_suppliers_rest_active
  ON public.suppliers (restaurant_id, active);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers: membro ve" ON public.suppliers;
CREATE POLICY "suppliers: membro ve"
ON public.suppliers FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "suppliers: owner/manager gerencia" ON public.suppliers;
CREATE POLICY "suppliers: owner/manager gerencia"
ON public.suppliers FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- Staff pode INSERT (cadastrar fornecedor novo no fluxo de "Novo Recebimento")
DROP POLICY IF EXISTS "suppliers: membro pode cadastrar" ON public.suppliers;
CREATE POLICY "suppliers: membro pode cadastrar"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (public.is_restaurant_member(restaurant_id));


-- ===========================================================================
-- PARTE 2 — Tabela receiving_templates
-- ===========================================================================
-- Modelo de recebimento: NÃO é atividade, NÃO tem assumption, NÃO conta em
-- dashboard. Apenas serve de blueprint para instanciar execuções reais.
CREATE TABLE IF NOT EXISTS public.receiving_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  description          text NULL,
  area_id              uuid NOT NULL REFERENCES public.areas(id),
  role_id              uuid NULL REFERENCES public.roles(id),
  assigned_to_user_id  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  shift                text NULL
    CHECK (shift IS NULL OR shift IN ('morning','afternoon','evening')),
  recurrence           text NOT NULL DEFAULT 'daily'
    CHECK (recurrence IN ('daily','weekly','monthly','yearly','weekdays','custom','shift_days')),
  recurrence_config    jsonb NULL,
  enforce_sequential_order boolean NOT NULL DEFAULT false,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.receiving_templates IS
  'Blueprint de recebimento. Define disponibilidade (recorrência) e escopo (área/role/user) para o picker "+ Novo Recebimento" no Meu Turno. Nunca vira atividade direta.';

CREATE INDEX IF NOT EXISTS idx_recv_tpl_rest_active_area
  ON public.receiving_templates (restaurant_id, active, area_id);

CREATE INDEX IF NOT EXISTS idx_recv_tpl_rest_assigned_user
  ON public.receiving_templates (restaurant_id, assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

ALTER TABLE public.receiving_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receiving_templates: membro ve" ON public.receiving_templates;
CREATE POLICY "receiving_templates: membro ve"
ON public.receiving_templates FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "receiving_templates: owner/manager gerencia" ON public.receiving_templates;
CREATE POLICY "receiving_templates: owner/manager gerencia"
ON public.receiving_templates FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));


-- ===========================================================================
-- PARTE 3 — Tabela receiving_template_tasks
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.receiving_template_tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          uuid NOT NULL REFERENCES public.receiving_templates(id) ON DELETE CASCADE,
  restaurant_id        uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text NULL,
  "order"              integer NOT NULL DEFAULT 0,
  requires_photo       boolean NOT NULL DEFAULT false,
  is_critical          boolean NOT NULL DEFAULT false,
  requires_observation boolean NOT NULL DEFAULT false,
  type                 text NULL
    CHECK (type IS NULL OR type IN ('boolean','date','number','rating')),
  max_photos           integer NULL,
  task_config          jsonb NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.receiving_template_tasks IS
  'Tasks do modelo de recebimento. Clonadas para checklist_tasks quando uma execução é instanciada via /api/receiving/instantiate.';

CREATE INDEX IF NOT EXISTS idx_recv_tpl_tasks_template_order
  ON public.receiving_template_tasks (template_id, "order");

ALTER TABLE public.receiving_template_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receiving_template_tasks: membro ve" ON public.receiving_template_tasks;
CREATE POLICY "receiving_template_tasks: membro ve"
ON public.receiving_template_tasks FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "receiving_template_tasks: owner/manager gerencia" ON public.receiving_template_tasks;
CREATE POLICY "receiving_template_tasks: owner/manager gerencia"
ON public.receiving_template_tasks FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));


-- ===========================================================================
-- PARTE 4 — Colunas em checklists para ligar execução → modelo + fornecedor
-- ===========================================================================
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS source_template_id uuid NULL
    REFERENCES public.receiving_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid NULL
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.checklists.source_template_id IS
  'Quando preenchido, este checklist é uma execução one-shot instanciada do modelo de recebimento indicado.';
COMMENT ON COLUMN public.checklists.supplier_id IS
  'Fornecedor selecionado pelo colaborador no momento da instanciação. Aplicável apenas a execuções de recebimento.';

CREATE INDEX IF NOT EXISTS idx_checklists_source_template
  ON public.checklists (source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklists_supplier
  ON public.checklists (supplier_id)
  WHERE supplier_id IS NOT NULL;


-- ===========================================================================
-- PARTE 5 — Trigger updated_at em receiving_templates
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_receiving_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS receiving_templates_updated_at ON public.receiving_templates;
CREATE TRIGGER receiving_templates_updated_at
  BEFORE UPDATE ON public.receiving_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_receiving_templates_updated_at();

COMMIT;
