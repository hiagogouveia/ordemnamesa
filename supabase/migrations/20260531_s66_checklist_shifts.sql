-- Sprint 66 — Múltiplos turnos por rotina (N:N)
-- Tabela de junção checklists ↔ shifts. Fonte da verdade dos turnos da rotina.
--
--   conjunto vazio (sem linhas)  -> "Todos os turnos" (visível a todos).
--   1+ linhas                    -> rotina pertence àqueles turnos.
--
-- A coluna checklists.shift_id é MANTIDA temporariamente (transição segura;
-- removida em ciclo futuro após validação). O enum `shift` continua como
-- sombra derivada para consumidores legados (checklist_orders, reports).

BEGIN;

CREATE TABLE IF NOT EXISTS public.checklist_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  checklist_id  uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  shift_id      uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_shifts_checklist ON public.checklist_shifts (checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_shifts_rest_shift ON public.checklist_shifts (restaurant_id, shift_id);

COMMENT ON TABLE public.checklist_shifts IS
  'N:N rotina↔turno (s66). Conjunto vazio = "Todos os turnos". Fonte da verdade; checklists.shift_id mantido temporariamente para compat.';

ALTER TABLE public.checklist_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_shifts: membro ve" ON public.checklist_shifts;
CREATE POLICY "checklist_shifts: membro ve"
ON public.checklist_shifts FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklist_shifts: owner/manager gerencia" ON public.checklist_shifts;
CREATE POLICY "checklist_shifts: owner/manager gerencia"
ON public.checklist_shifts FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- Backfill: rotinas com shift_id setado viram 1 linha. shift_id NULL ("Todos os
-- turnos") permanece sem linha (conjunto vazio).
INSERT INTO public.checklist_shifts (restaurant_id, checklist_id, shift_id)
SELECT c.restaurant_id, c.id, c.shift_id
  FROM public.checklists c
 WHERE c.shift_id IS NOT NULL
ON CONFLICT (checklist_id, shift_id) DO NOTHING;

COMMIT;
