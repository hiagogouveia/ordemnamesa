-- Sprint 67 — Múltiplos turnos por modelo de recebimento (N:N)
-- Tabela de junção receiving_templates ↔ shifts. Mesma semântica do s66:
--   conjunto vazio = "Todos os turnos"; 1+ linhas = turnos do modelo.
-- receiving_templates.shift_id mantido temporariamente para compat.

BEGIN;

CREATE TABLE IF NOT EXISTS public.receiving_template_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  template_id   uuid NOT NULL REFERENCES public.receiving_templates(id) ON DELETE CASCADE,
  shift_id      uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_rt_shifts_template ON public.receiving_template_shifts (template_id);
CREATE INDEX IF NOT EXISTS idx_rt_shifts_rest_shift ON public.receiving_template_shifts (restaurant_id, shift_id);

COMMENT ON TABLE public.receiving_template_shifts IS
  'N:N modelo de recebimento↔turno (s67). Conjunto vazio = "Todos os turnos".';

ALTER TABLE public.receiving_template_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rt_shifts: membro ve" ON public.receiving_template_shifts;
CREATE POLICY "rt_shifts: membro ve"
ON public.receiving_template_shifts FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "rt_shifts: owner/manager gerencia" ON public.receiving_template_shifts;
CREATE POLICY "rt_shifts: owner/manager gerencia"
ON public.receiving_template_shifts FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

INSERT INTO public.receiving_template_shifts (restaurant_id, template_id, shift_id)
SELECT t.restaurant_id, t.id, t.shift_id
  FROM public.receiving_templates t
 WHERE t.shift_id IS NOT NULL
ON CONFLICT (template_id, shift_id) DO NOTHING;

COMMIT;
