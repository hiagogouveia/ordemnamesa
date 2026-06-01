-- ============================================================
-- Sprint 73 — Timezone por restaurante (fonte da verdade operacional)
-- ============================================================
-- Adiciona o fuso do restaurante. Toda lógica operacional de "hoje"/atraso
-- passa a usar este fuso. Default 'America/Sao_Paulo' preserva 100% do
-- comportamento atual da base existente (forward-fix). Coluna aditiva com
-- default constante → fast-default, sem rewrite/lock.
-- ============================================================

BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- Conjunto fechado dos fusos IANA do Brasil (GMT-2 a GMT-5).
ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_timezone_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_timezone_check CHECK (timezone IN (
    'America/Sao_Paulo',   -- GMT-3 (default)
    'America/Bahia',
    'America/Fortaleza',
    'America/Recife',
    'America/Maceio',
    'America/Belem',
    'America/Araguaina',
    'America/Campo_Grande', -- GMT-4
    'America/Cuiaba',
    'America/Manaus',
    'America/Boa_Vista',
    'America/Porto_Velho',
    'America/Rio_Branco',   -- GMT-5
    'America/Eirunepe',
    'America/Noronha'       -- GMT-2
  ));

COMMENT ON COLUMN public.restaurants.timezone IS
  'Fuso IANA do restaurante. Fonte da verdade para cálculos operacionais de dia/hora/atraso. Default America/Sao_Paulo.';

COMMIT;
