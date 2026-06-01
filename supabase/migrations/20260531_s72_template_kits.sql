-- ============================================================
-- Sprint 72 — Kits de Rotinas (schema)
-- ============================================================
-- Camada acima dos modelos: um Kit agrupa modelos por segmento e
-- instala em lote. Tabelas GLOBAIS read-only (padrão dos templates).
-- Aplicação clona os modelos em checklists do tenant (cópia congelada),
-- marcando origin_kit_id apenas para rastreabilidade — sem sincronização.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- template_kits (catálogo global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_kits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NULL,
  segment     text NOT NULL
    CHECK (segment IN ('restaurante','hamburgueria','pizzaria','cafeteria','fast_food','gastrobar')),
  icon        text NULL,
  is_active   boolean NOT NULL DEFAULT true,
  version     int NOT NULL DEFAULT 1,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.template_kits IS
  'Kits de implantação (global). Agrupam modelos por segmento para instalação em lote. version = rastreabilidade apenas.';

CREATE INDEX IF NOT EXISTS idx_template_kits_segment_sort
  ON public.template_kits (segment, sort_order);

ALTER TABLE public.template_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_kits_select_auth ON public.template_kits;
CREATE POLICY template_kits_select_auth ON public.template_kits FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- template_kit_items (composição: kit -> modelos, com nível)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_kit_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id            uuid NOT NULL REFERENCES public.template_kits(id) ON DELETE CASCADE,
  template_id       uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  requirement_level text NOT NULL
    CHECK (requirement_level IN ('obrigatorio','recomendado','opcional')),
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, template_id)
);

COMMENT ON TABLE public.template_kit_items IS
  'Modelos que compõem um kit e seu nível (obrigatorio=Essencial, recomendado=Completo, opcional=avulso).';

CREATE INDEX IF NOT EXISTS idx_template_kit_items_kit
  ON public.template_kit_items (kit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_template_kit_items_template
  ON public.template_kit_items (template_id);

ALTER TABLE public.template_kit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_kit_items_select_auth ON public.template_kit_items;
CREATE POLICY template_kit_items_select_auth ON public.template_kit_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- checklists.origin_kit_id (rastreabilidade da origem por kit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS origin_kit_id uuid NULL
    REFERENCES public.template_kits(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.checklists.origin_kit_id IS
  'Kit de origem quando a rotina foi criada por "Aplicar Kit". Somente rastreabilidade.';

CREATE INDEX IF NOT EXISTS idx_checklists_origin_kit
  ON public.checklists (origin_kit_id)
  WHERE origin_kit_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_template_kits_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS template_kits_updated_at ON public.template_kits;
CREATE TRIGGER template_kits_updated_at
  BEFORE UPDATE ON public.template_kits
  FOR EACH ROW EXECUTE FUNCTION public.tg_template_kits_updated_at();

COMMIT;
