-- ============================================================
-- Sprint 70 — Modelos de Rotinas Prontas (catálogo global)
-- ============================================================
-- Catálogo curado e GLOBAL de rotinas operacionais prontas, que
-- restaurantes novos importam para reduzir o time-to-value.
--
-- Arquitetura (Opção A): tabelas próprias SEM restaurant_id —
-- consistente com a tabela `plans` (catálogo público-read). Modelos
-- NUNCA viram atividade executável: a importação CLONA o conteúdo
-- para checklists + checklist_tasks do tenant (cópia congelada).
--
-- RLS: SELECT liberado para autenticados (catálogo). Escrita apenas
-- via service_role/migrations (sem policy INSERT/UPDATE/DELETE).
--
-- `version` / `origin_template_version` são APENAS rastreabilidade:
-- não há sincronização nem upgrade de rotinas já importadas.
-- ============================================================

BEGIN;

-- ===========================================================================
-- PARTE 1 — checklist_templates (blueprint global)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text NOT NULL UNIQUE,
  name                        text NOT NULL,
  description                 text NULL,
  category                    text NOT NULL
    CHECK (category IN (
      'caixa','cozinha','salao','estoque','limpeza',
      'banheiros','seguranca_alimentar','equipamentos',
      'manutencao','delivery','administrativo'
    )),
  icon                        text NULL,
  suggested_type              text NOT NULL DEFAULT 'regular'
    CHECK (suggested_type IN ('regular','opening','closing')),
  suggested_area_label        text NULL,
  suggested_recurrence        text NULL,
  suggested_recurrence_config jsonb NULL,
  is_premium                  boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT true,
  version                     int NOT NULL DEFAULT 1,
  sort_order                  int NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checklist_templates IS
  'Catálogo global de rotinas prontas. Importação clona o conteúdo para checklists do tenant. Nunca vira atividade direta.';
COMMENT ON COLUMN public.checklist_templates.version IS
  'Rastreabilidade apenas — não dispara upgrade/sync de rotinas já importadas.';

CREATE INDEX IF NOT EXISTS idx_checklist_templates_category_sort
  ON public.checklist_templates (category, sort_order);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_select_auth ON public.checklist_templates;
CREATE POLICY checklist_templates_select_auth ON public.checklist_templates FOR SELECT
  USING (auth.role() = 'authenticated');


-- ===========================================================================
-- PARTE 2 — checklist_template_items (itens do blueprint)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  item_slug            text NOT NULL,
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
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, item_slug)
);

COMMENT ON TABLE public.checklist_template_items IS
  'Itens de um modelo de rotina. Clonados para checklist_tasks na importação. item_slug garante seed idempotente.';

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template_order
  ON public.checklist_template_items (template_id, "order");

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_template_items_select_auth ON public.checklist_template_items;
CREATE POLICY checklist_template_items_select_auth ON public.checklist_template_items FOR SELECT
  USING (auth.role() = 'authenticated');


-- ===========================================================================
-- PARTE 3 — Rastreabilidade da origem em checklists
-- ===========================================================================
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS origin_template_id uuid NULL
    REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_template_version int NULL;

COMMENT ON COLUMN public.checklists.origin_template_id IS
  'Modelo de origem quando a rotina foi importada do catálogo. Somente rastreabilidade — não sincroniza.';
COMMENT ON COLUMN public.checklists.origin_template_version IS
  'Snapshot da versão do modelo no momento da importação. Somente auditoria.';

CREATE INDEX IF NOT EXISTS idx_checklists_origin_template
  ON public.checklists (origin_template_id)
  WHERE origin_template_id IS NOT NULL;


-- ===========================================================================
-- PARTE 4 — Trigger updated_at em checklist_templates
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_checklist_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS checklist_templates_updated_at ON public.checklist_templates;
CREATE TRIGGER checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_checklist_templates_updated_at();

COMMIT;
