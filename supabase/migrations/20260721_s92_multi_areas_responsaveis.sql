-- Sprint 92 — Múltiplas áreas e múltiplos responsáveis por rotina/modelo de recebimento
--
-- Problema: `checklists.area_id` e `receiving_templates.area_id` amarram a rotina a UMA
-- área, e `assigned_to_user_id` a UM responsável. Na operação real o mesmo recebimento
-- pode ser executado por Gerência, Cozinha ou Estoque — hoje isso obriga a duplicar
-- modelos idênticos só para trocar a área.
--
-- Modelo: tabelas de junção (mesmo padrão N:N dos turnos, s66/s67). As colunas
-- `area_id` / `assigned_to_user_id` PERMANECEM como SOMBRAS DERIVADAS, mantidas por
-- trigger — nunca escritas à mão como fonte de verdade. Elas existem para:
--   a) manter o embed PostgREST `area:areas!area_id(...)` funcionando;
--   b) não quebrar nenhum caminho de leitura legado.
--
-- Discriminador autoritativo do modo de atribuição passa a ser `assignment_type`
-- ('area' | 'user' | 'all'), porque `assigned_to_user_id = NULL` deixou de significar
-- "distribuído por área" (com 2+ responsáveis a sombra também é NULL).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabelas de junção
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checklist_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  checklist_id  uuid NOT NULL REFERENCES public.checklists(id)  ON DELETE CASCADE,
  area_id       uuid NOT NULL REFERENCES public.areas(id)       ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_areas_checklist ON public.checklist_areas (checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_areas_rest_area ON public.checklist_areas (restaurant_id, area_id);

COMMENT ON TABLE public.checklist_areas IS
  'N:N rotina↔área (s92). Fonte da verdade. Todas as áreas têm o mesmo peso — não existe área principal. Conjunto vazio = rotina não executável.';

CREATE TABLE IF NOT EXISTS public.checklist_responsibles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  checklist_id  uuid NOT NULL REFERENCES public.checklists(id)  ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_resp_checklist ON public.checklist_responsibles (checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_resp_rest_user ON public.checklist_responsibles (restaurant_id, user_id);

COMMENT ON TABLE public.checklist_responsibles IS
  'N:N rotina↔responsável (s92). Só é consultada quando checklists.assignment_type = ''user''. Conjunto vazio com assignment_type=''user'' = rotina invisível (bloqueado na API).';

CREATE TABLE IF NOT EXISTS public.receiving_template_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id)        ON DELETE CASCADE,
  template_id   uuid NOT NULL REFERENCES public.receiving_templates(id) ON DELETE CASCADE,
  area_id       uuid NOT NULL REFERENCES public.areas(id)              ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_rt_areas_template  ON public.receiving_template_areas (template_id);
CREATE INDEX IF NOT EXISTS idx_rt_areas_rest_area ON public.receiving_template_areas (restaurant_id, area_id);

COMMENT ON TABLE public.receiving_template_areas IS
  'N:N modelo de recebimento↔área (s92). Fonte da verdade; copiada para checklist_areas quando o one-shot é instanciado.';

CREATE TABLE IF NOT EXISTS public.receiving_template_responsibles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id)        ON DELETE CASCADE,
  template_id   uuid NOT NULL REFERENCES public.receiving_templates(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id)              ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rt_resp_template  ON public.receiving_template_responsibles (template_id);
CREATE INDEX IF NOT EXISTS idx_rt_resp_rest_user ON public.receiving_template_responsibles (restaurant_id, user_id);

COMMENT ON TABLE public.receiving_template_responsibles IS
  'N:N modelo de recebimento↔responsável (s92). Só consultada quando receiving_templates.assignment_type = ''user''.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — espelha exatamente as políticas de checklist_shifts / rt_shifts
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.checklist_areas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_responsibles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_template_areas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_template_responsibles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_areas: membro ve" ON public.checklist_areas;
CREATE POLICY "checklist_areas: membro ve"
ON public.checklist_areas FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklist_areas: owner/manager gerencia" ON public.checklist_areas;
CREATE POLICY "checklist_areas: owner/manager gerencia"
ON public.checklist_areas FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "checklist_responsibles: membro ve" ON public.checklist_responsibles;
CREATE POLICY "checklist_responsibles: membro ve"
ON public.checklist_responsibles FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklist_responsibles: owner/manager gerencia" ON public.checklist_responsibles;
CREATE POLICY "checklist_responsibles: owner/manager gerencia"
ON public.checklist_responsibles FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "rt_areas: membro ve" ON public.receiving_template_areas;
CREATE POLICY "rt_areas: membro ve"
ON public.receiving_template_areas FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "rt_areas: owner/manager gerencia" ON public.receiving_template_areas;
CREATE POLICY "rt_areas: owner/manager gerencia"
ON public.receiving_template_areas FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "rt_resp: membro ve" ON public.receiving_template_responsibles;
CREATE POLICY "rt_resp: membro ve"
ON public.receiving_template_responsibles FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "rt_resp: owner/manager gerencia" ON public.receiving_template_responsibles;
CREATE POLICY "rt_resp: owner/manager gerencia"
ON public.receiving_template_responsibles FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

GRANT ALL ON TABLE public.checklist_areas                 TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.checklist_responsibles          TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.receiving_template_areas        TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.receiving_template_responsibles TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Colunas: sombras passam a ser nuláveis; assignment_type no modelo
-- ─────────────────────────────────────────────────────────────────────────────

-- A invariante "≥1 área" migra do NOT NULL (que só protegia a sombra) para a
-- validação de API, que já existe. Sem isso, excluir a última área de uma rotina
-- estouraria o NOT NULL no meio do CASCADE.
ALTER TABLE public.checklists          ALTER COLUMN area_id DROP NOT NULL;
ALTER TABLE public.receiving_templates ALTER COLUMN area_id DROP NOT NULL;

-- receiving_templates.area_id não tinha ação de exclusão (NO ACTION) — bloqueava
-- apagar a área. Alinha com checklists: SET NULL, e o trigger de reparo abaixo
-- recoloca outra área do conjunto quando houver.
ALTER TABLE public.receiving_templates DROP CONSTRAINT IF EXISTS receiving_templates_area_id_fkey;
ALTER TABLE public.receiving_templates
  ADD CONSTRAINT receiving_templates_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL;

ALTER TABLE public.receiving_templates
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'area';

ALTER TABLE public.receiving_templates DROP CONSTRAINT IF EXISTS receiving_templates_assignment_type_check;
ALTER TABLE public.receiving_templates
  ADD CONSTRAINT receiving_templates_assignment_type_check
  CHECK (assignment_type IN ('area', 'user'));

COMMENT ON COLUMN public.checklists.area_id IS
  's92 — DEPRECADO (sombra derivada). Fonte da verdade: checklist_areas. Mantida por trigger = primeira área por nome; NULL quando o conjunto está vazio. Existe para o embed area:areas!area_id e compat de leitura.';
COMMENT ON COLUMN public.checklists.assigned_to_user_id IS
  's92 — DEPRECADO (sombra derivada). Fonte da verdade: checklist_responsibles. Preenchida só quando há EXATAMENTE 1 responsável; NULL com 0 ou 2+. Use assignment_type para saber o modo.';
COMMENT ON COLUMN public.receiving_templates.area_id IS
  's92 — DEPRECADO (sombra derivada). Fonte da verdade: receiving_template_areas.';
COMMENT ON COLUMN public.receiving_templates.assigned_to_user_id IS
  's92 — DEPRECADO (sombra derivada). Fonte da verdade: receiving_template_responsibles.';
COMMENT ON COLUMN public.receiving_templates.assignment_type IS
  's92 — Discriminador do modo de atribuição: ''area'' (toda a equipe das áreas) | ''user'' (responsáveis específicos em receiving_template_responsibles).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Triggers de sombra (a junção manda; a coluna segue)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_checklist_area_shadow() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_checklist uuid;
  v_shadow    uuid;
BEGIN
  v_checklist := CASE WHEN TG_OP = 'DELETE' THEN OLD.checklist_id ELSE NEW.checklist_id END;

  SELECT ca.area_id INTO v_shadow
    FROM public.checklist_areas ca
    JOIN public.areas a ON a.id = ca.area_id
   WHERE ca.checklist_id = v_checklist
   ORDER BY a.name, ca.area_id
   LIMIT 1;

  UPDATE public.checklists
     SET area_id = v_shadow
   WHERE id = v_checklist
     AND area_id IS DISTINCT FROM v_shadow;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sync_checklist_responsible_shadow() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_checklist uuid;
  v_shadow    uuid;
  v_count     integer;
BEGIN
  v_checklist := CASE WHEN TG_OP = 'DELETE' THEN OLD.checklist_id ELSE NEW.checklist_id END;

  SELECT count(*) INTO v_count
    FROM public.checklist_responsibles cr
   WHERE cr.checklist_id = v_checklist;

  IF v_count = 1 THEN
    SELECT cr.user_id INTO v_shadow
      FROM public.checklist_responsibles cr
     WHERE cr.checklist_id = v_checklist
     LIMIT 1;
  ELSE
    v_shadow := NULL;
  END IF;

  UPDATE public.checklists
     SET assigned_to_user_id = v_shadow
   WHERE id = v_checklist
     AND assigned_to_user_id IS DISTINCT FROM v_shadow;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sync_template_area_shadow() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template uuid;
  v_shadow   uuid;
BEGIN
  v_template := CASE WHEN TG_OP = 'DELETE' THEN OLD.template_id ELSE NEW.template_id END;

  SELECT rta.area_id INTO v_shadow
    FROM public.receiving_template_areas rta
    JOIN public.areas a ON a.id = rta.area_id
   WHERE rta.template_id = v_template
   ORDER BY a.name, rta.area_id
   LIMIT 1;

  UPDATE public.receiving_templates
     SET area_id = v_shadow
   WHERE id = v_template
     AND area_id IS DISTINCT FROM v_shadow;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sync_template_responsible_shadow() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template uuid;
  v_shadow   uuid;
  v_count    integer;
BEGIN
  v_template := CASE WHEN TG_OP = 'DELETE' THEN OLD.template_id ELSE NEW.template_id END;

  SELECT count(*) INTO v_count
    FROM public.receiving_template_responsibles rtr
   WHERE rtr.template_id = v_template;

  IF v_count = 1 THEN
    SELECT rtr.user_id INTO v_shadow
      FROM public.receiving_template_responsibles rtr
     WHERE rtr.template_id = v_template
     LIMIT 1;
  ELSE
    v_shadow := NULL;
  END IF;

  UPDATE public.receiving_templates
     SET assigned_to_user_id = v_shadow
   WHERE id = v_template
     AND assigned_to_user_id IS DISTINCT FROM v_shadow;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_checklist_area_shadow ON public.checklist_areas;
CREATE TRIGGER trg_sync_checklist_area_shadow
AFTER INSERT OR DELETE ON public.checklist_areas
FOR EACH ROW EXECUTE FUNCTION public.sync_checklist_area_shadow();

DROP TRIGGER IF EXISTS trg_sync_checklist_responsible_shadow ON public.checklist_responsibles;
CREATE TRIGGER trg_sync_checklist_responsible_shadow
AFTER INSERT OR DELETE ON public.checklist_responsibles
FOR EACH ROW EXECUTE FUNCTION public.sync_checklist_responsible_shadow();

DROP TRIGGER IF EXISTS trg_sync_template_area_shadow ON public.receiving_template_areas;
CREATE TRIGGER trg_sync_template_area_shadow
AFTER INSERT OR DELETE ON public.receiving_template_areas
FOR EACH ROW EXECUTE FUNCTION public.sync_template_area_shadow();

DROP TRIGGER IF EXISTS trg_sync_template_responsible_shadow ON public.receiving_template_responsibles;
CREATE TRIGGER trg_sync_template_responsible_shadow
AFTER INSERT OR DELETE ON public.receiving_template_responsibles
FOR EACH ROW EXECUTE FUNCTION public.sync_template_responsible_shadow();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reparo pós-exclusão de área
--
-- Excluir uma área dispara, no mesmo statement, DUAS coisas: o CASCADE nas junções
-- (que roda o trigger de sombra) e o ON DELETE SET NULL das colunas-sombra. A ordem
-- entre elas não é garantida, então a sombra pode terminar NULL mesmo com outras
-- áreas no conjunto. Este trigger de STATEMENT roda depois de todos os de linha e
-- recoloca a sombra correta.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.repair_area_shadows() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.checklists c
     SET area_id = s.first_area
    FROM (
      SELECT ca.checklist_id, (array_agg(ca.area_id ORDER BY a.name, ca.area_id))[1] AS first_area
        FROM public.checklist_areas ca
        JOIN public.areas a ON a.id = ca.area_id
       GROUP BY ca.checklist_id
    ) s
   WHERE c.id = s.checklist_id
     AND c.area_id IS DISTINCT FROM s.first_area;

  UPDATE public.receiving_templates t
     SET area_id = s.first_area
    FROM (
      SELECT rta.template_id, (array_agg(rta.area_id ORDER BY a.name, rta.area_id))[1] AS first_area
        FROM public.receiving_template_areas rta
        JOIN public.areas a ON a.id = rta.area_id
       GROUP BY rta.template_id
    ) s
   WHERE t.id = s.template_id
     AND t.area_id IS DISTINCT FROM s.first_area;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_repair_area_shadows ON public.areas;
CREATE TRIGGER trg_repair_area_shadows
AFTER DELETE ON public.areas
FOR EACH STATEMENT EXECUTE FUNCTION public.repair_area_shadows();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Materialização automática na criação de rotina
--
-- Cobre TODOS os caminhos SQL que criam checklists sem passar pelas APIs, sem
-- precisar reescrever as RPCs grandes (apply_kit, instantiate_receiving_execution,
-- replicate_checklists — ~400 linhas de plpgsql cujo replace seria risco puro):
--   a) veio de modelo de recebimento  → herda áreas E responsáveis do modelo
--   b) veio de replicação entre unidades → herda as áreas mapeadas por NOME na
--      unidade destino (criando a área se não existir, igual faz replicate_checklists
--      para a área-sombra). Responsáveis NÃO são copiados: usuários não cruzam unidade.
--   c) fallback → materializa a sombra que o INSERT trouxe
-- As APIs sobrescrevem com replaceChecklistAreas/Responsibles logo em seguida.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.materialize_checklist_links() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_src_area  record;
  v_tgt_area  uuid;
  v_has_areas boolean;
BEGIN
  IF NEW.source_template_id IS NOT NULL THEN
    INSERT INTO public.checklist_areas (restaurant_id, checklist_id, area_id)
    SELECT NEW.restaurant_id, NEW.id, rta.area_id
      FROM public.receiving_template_areas rta
     WHERE rta.template_id = NEW.source_template_id
    ON CONFLICT (checklist_id, area_id) DO NOTHING;

    INSERT INTO public.checklist_responsibles (restaurant_id, checklist_id, user_id)
    SELECT NEW.restaurant_id, NEW.id, rtr.user_id
      FROM public.receiving_template_responsibles rtr
     WHERE rtr.template_id = NEW.source_template_id
    ON CONFLICT (checklist_id, user_id) DO NOTHING;

  ELSIF NEW.source_checklist_id IS NOT NULL THEN
    FOR v_src_area IN
      SELECT a.name, a.description, a.color, a.priority_mode, a.max_parallel_tasks
        FROM public.checklist_areas ca
        JOIN public.areas a ON a.id = ca.area_id
       WHERE ca.checklist_id = NEW.source_checklist_id
    LOOP
      SELECT a.id INTO v_tgt_area
        FROM public.areas a
       WHERE a.restaurant_id = NEW.restaurant_id
         AND lower(btrim(a.name)) = lower(btrim(v_src_area.name))
       LIMIT 1;

      IF v_tgt_area IS NULL THEN
        INSERT INTO public.areas (restaurant_id, name, description, color, priority_mode, max_parallel_tasks)
        VALUES (NEW.restaurant_id, v_src_area.name, v_src_area.description, v_src_area.color,
                v_src_area.priority_mode, v_src_area.max_parallel_tasks)
        RETURNING id INTO v_tgt_area;
      END IF;

      INSERT INTO public.checklist_areas (restaurant_id, checklist_id, area_id)
      VALUES (NEW.restaurant_id, NEW.id, v_tgt_area)
      ON CONFLICT (checklist_id, area_id) DO NOTHING;
    END LOOP;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.checklist_areas WHERE checklist_id = NEW.id) INTO v_has_areas;

  IF NOT v_has_areas AND NEW.area_id IS NOT NULL THEN
    INSERT INTO public.checklist_areas (restaurant_id, checklist_id, area_id)
    VALUES (NEW.restaurant_id, NEW.id, NEW.area_id)
    ON CONFLICT (checklist_id, area_id) DO NOTHING;
  END IF;

  IF NEW.assigned_to_user_id IS NOT NULL THEN
    INSERT INTO public.checklist_responsibles (restaurant_id, checklist_id, user_id)
    VALUES (NEW.restaurant_id, NEW.id, NEW.assigned_to_user_id)
    ON CONFLICT (checklist_id, user_id) DO NOTHING;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_materialize_checklist_links ON public.checklists;
CREATE TRIGGER trg_materialize_checklist_links
AFTER INSERT ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.materialize_checklist_links();

CREATE OR REPLACE FUNCTION public.materialize_template_links() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.area_id IS NOT NULL THEN
    INSERT INTO public.receiving_template_areas (restaurant_id, template_id, area_id)
    VALUES (NEW.restaurant_id, NEW.id, NEW.area_id)
    ON CONFLICT (template_id, area_id) DO NOTHING;
  END IF;

  IF NEW.assigned_to_user_id IS NOT NULL THEN
    INSERT INTO public.receiving_template_responsibles (restaurant_id, template_id, user_id)
    VALUES (NEW.restaurant_id, NEW.id, NEW.assigned_to_user_id)
    ON CONFLICT (template_id, user_id) DO NOTHING;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_materialize_template_links ON public.receiving_templates;
CREATE TRIGGER trg_materialize_template_links
AFTER INSERT ON public.receiving_templates
FOR EACH ROW EXECUTE FUNCTION public.materialize_template_links();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill — idempotente, re-executável, sem tocar em nenhuma coluna existente.
--    Inclui rotinas arquivadas e one-shots para o Histórico não perder vínculo.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.checklist_areas (restaurant_id, checklist_id, area_id)
SELECT c.restaurant_id, c.id, c.area_id
  FROM public.checklists c
 WHERE c.area_id IS NOT NULL
ON CONFLICT (checklist_id, area_id) DO NOTHING;

INSERT INTO public.checklist_responsibles (restaurant_id, checklist_id, user_id)
SELECT c.restaurant_id, c.id, c.assigned_to_user_id
  FROM public.checklists c
  JOIN public.users u ON u.id = c.assigned_to_user_id
 WHERE c.assigned_to_user_id IS NOT NULL
ON CONFLICT (checklist_id, user_id) DO NOTHING;

INSERT INTO public.receiving_template_areas (restaurant_id, template_id, area_id)
SELECT t.restaurant_id, t.id, t.area_id
  FROM public.receiving_templates t
 WHERE t.area_id IS NOT NULL
ON CONFLICT (template_id, area_id) DO NOTHING;

INSERT INTO public.receiving_template_responsibles (restaurant_id, template_id, user_id)
SELECT t.restaurant_id, t.id, t.assigned_to_user_id
  FROM public.receiving_templates t
  JOIN public.users u ON u.id = t.assigned_to_user_id
 WHERE t.assigned_to_user_id IS NOT NULL
ON CONFLICT (template_id, user_id) DO NOTHING;

UPDATE public.receiving_templates
   SET assignment_type = 'user'
 WHERE assigned_to_user_id IS NOT NULL
   AND assignment_type <> 'user';

COMMIT;
