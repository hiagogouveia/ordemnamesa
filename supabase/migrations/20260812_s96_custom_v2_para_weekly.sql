-- Sprint 96 — normaliza recorrências `custom` (v2/rrule) para `weekly` nativo.
--
-- ── CONTEXTO ────────────────────────────────────────────────────────────────
--
-- O tipo `custom` guarda a regra como string rrule (RFC 5545) e só nasce da
-- conversão automática v1 → v2 (`legacyConfigToV2Rrule`). Essa representação
-- criou três problemas, todos ausentes no tipo `weekly` nativo:
--
--  1. O rótulo na tela mostra apenas "Personalizada", sem os dias. Ironicamente
--     o formato v1 MOSTRAVA os dias — a conversão tornou a UI menos informativa.
--  2. O modal "Personalizar repetição" não sabe ler uma config v2 de volta
--     (só pré-preenche quando o payload tem `frequency`, que é campo do v1).
--     Resultado: abre sempre em "1 semana / segunda / nunca", independentemente
--     do que está salvo — e confirmar reescreve a agenda em silêncio.
--  3. Depende da engine de rrule, cujas strings não têm `DTSTART` (vide
--     20260812 / s96 no código: `evaluateCustomRange`).
--
-- Toda rotina `custom` em produção é `FREQ=WEEKLY;BYDAY=...` puro — exatamente
-- o que `{version:2, type:'weekly', weekdays:[...]}` representa. A conversão é
-- 1:1, sem perda, e devolve essas rotinas para o caminho mais testado do sistema.
--
-- ── ESCOPO (deliberadamente estreito) ───────────────────────────────────────
--
-- Só migra linhas que casam EXATAMENTE `^FREQ=WEEKLY;BYDAY=<dias>$`. Qualquer
-- rrule com INTERVAL, COUNT, UNTIL ou DTSTART fica INTACTA: essas carregam
-- semântica que `weekly` não representa, e converter perderia informação.
--
-- Não toca em `custom` v1 (payload com `frequency`). Elas não têm nenhum dos
-- três problemas acima: o modal as pré-preenche corretamente e o evaluator usa
-- o caminho v1, sem rrule.
--
-- ── EFEITO COLATERAL CONHECIDO ──────────────────────────────────────────────
--
-- `periodStartFor` (lib/api/checklist-reset.ts) devolve NULL para 'custom' e o
-- início da semana para 'weekly'. Ou seja: estas rotinas passam a participar do
-- reset semanal do quadro, que hoje as ignora. O reset só remove execuções em
-- `status='doing'` de períodos anteriores — histórico concluído é imutável.
-- Verificado antes de aplicar: as rotinas afetadas têm ZERO execuções 'doing'
-- (695 execuções, todas em status terminal), então o primeiro reset não remove
-- nada. Daqui para a frente o comportamento passa a ser o correto para uma
-- rotina semanal, em vez de acumular execuções abandonadas indefinidamente.
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
--
-- `git revert` não desfaz UPDATE. O estado anterior fica em
-- `checklists_recurrence_backup_s96`. Para reverter:
--
--   UPDATE public.checklists c
--      SET recurrence = b.recurrence_before,
--          recurrence_config = b.recurrence_config_before
--     FROM public.checklists_recurrence_backup_s96 b
--    WHERE c.id = b.checklist_id;

BEGIN;

-- ── 1) Backup do estado anterior ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checklists_recurrence_backup_s96 (
    checklist_id             uuid PRIMARY KEY,
    restaurant_id            uuid        NOT NULL,
    recurrence_before        text,
    recurrence_config_before jsonb,
    migrated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checklists_recurrence_backup_s96 IS
    'Sprint 96 — estado de recorrencia anterior a normalizacao custom(v2/rrule) -> weekly. Rede de reversao: UPDATE nao volta com git revert. Pode ser dropada apos a mudanca estar estavel em producao.';

-- Tabela operacional, sem acesso de cliente: RLS ligada e SEM policy = ninguem
-- le pelo PostgREST. A service role (migrations/jobs) segue com acesso.
ALTER TABLE public.checklists_recurrence_backup_s96 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.checklists_recurrence_backup_s96
    (checklist_id, restaurant_id, recurrence_before, recurrence_config_before)
SELECT c.id, c.restaurant_id, c.recurrence, c.recurrence_config
  FROM public.checklists c
 WHERE c.recurrence_config->>'version' = '2'
   AND c.recurrence_config->>'type'    = 'custom'
   AND (c.recurrence_config->>'rrule') ~
       '^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)(,(SU|MO|TU|WE|TH|FR|SA))*$'
ON CONFLICT (checklist_id) DO NOTHING;

-- ── 2) Conversão BYDAY → weekdays ───────────────────────────────────────────
--
-- SU=0 … SA=6, mesma convenção de `getNowInTz().dayOfWeek`, `evaluateV2` e
-- `WEEKDAY_NAMES`. `DISTINCT ... ORDER BY` reproduz o dedup+sort que
-- `validateV2` aplica ao gravar pela API, para o payload ficar idêntico ao que
-- o formulário produziria.
--
-- A atualização é dirigida PELO BACKUP: nada é escrito sem ter sido salvo antes.
-- O predicado final garante idempotência (rodar de novo não faz nada).

UPDATE public.checklists c
   SET recurrence        = 'weekly',
       recurrence_config = jsonb_build_object(
           'version',  2,
           'type',     'weekly',
           'weekdays', d.weekdays
       )
  FROM (
        SELECT b.checklist_id,
               jsonb_agg(DISTINCT m.n ORDER BY m.n) AS weekdays
          FROM public.checklists_recurrence_backup_s96 b
         CROSS JOIN LATERAL unnest(
                   string_to_array(
                       substring(b.recurrence_config_before->>'rrule' FROM 'BYDAY=([A-Z,]+)'),
                       ','
                   )
               ) AS tok
         CROSS JOIN LATERAL (
                   SELECT CASE tok
                              WHEN 'SU' THEN 0
                              WHEN 'MO' THEN 1
                              WHEN 'TU' THEN 2
                              WHEN 'WE' THEN 3
                              WHEN 'TH' THEN 4
                              WHEN 'FR' THEN 5
                              WHEN 'SA' THEN 6
                          END AS n
               ) m
         GROUP BY b.checklist_id
       ) d
 WHERE c.id = d.checklist_id
   AND c.recurrence_config->>'type' = 'custom';

COMMIT;
