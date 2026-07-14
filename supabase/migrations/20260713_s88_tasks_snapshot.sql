-- Sprint 88 — Snapshot da composição da rotina na sessão de execução
--
-- PROBLEMA
-- A auditoria reconstrói "quais tarefas a rotina tinha no dia X" a partir da definição ATUAL
-- (`checklist_tasks`), porque uma tarefa nunca tocada não gera linha em `task_executions`.
-- Consequência: toda edição da rotina reescreve o passado, e por isso a API foi obrigada a
-- recusar silenciosamente a exclusão de tarefas já executadas (bug: "removi a tarefa, salvei,
-- ela voltou").
--
-- SOLUÇÃO
-- `checklist_assumptions` (a sessão de execução) passa a carregar a composição da rotina no
-- momento em que foi assumida. O passado vira auto-suficiente e a definição pode evoluir livremente.
--
-- CONGELAMENTO: o snapshot é escrito UMA ÚNICA VEZ, na criação da assumption, e nunca mais é
-- tocado. A execução é o contrato firmado no momento do assume.
--
-- ⚠️ LIMITAÇÃO DO BACKFILL (leia antes de interpretar relatórios antigos)
-- Assumptions criadas ANTES desta migration não têm snapshot possível: a informação nunca foi
-- gravada e não é recuperável de lugar nenhum. O backfill abaixo preenche essas linhas com a
-- composição ATUAL do checklist — que é exatamente o que essas telas já exibem hoje, portanto
-- não há mudança de comportamento para dados antigos. Mas ISSO NÃO É FIDELIDADE HISTÓRICA:
--
--   • Execuções criadas a partir desta migration → snapshot fiel ao momento do assume.
--   • Execuções anteriores                       → refletem a composição atual da rotina,
--                                                  porque o snapshot não existia quando ocorreram.
--
-- Rollback:
--   alter table public.checklist_assumptions drop column tasks_snapshot;

-- ── 1. Coluna ────────────────────────────────────────────────────────────────────
alter table public.checklist_assumptions
    add column if not exists tasks_snapshot jsonb;

comment on column public.checklist_assumptions.tasks_snapshot is
    'Composição da rotina no momento do assume (s88). Congelado: escrito uma única vez, na criação '
    'da assumption. Fonte da lista de tarefas da Auditoria/PDF. Linhas anteriores à s88 foram '
    'backfilled com a composição atual do checklist e NÃO representam fidelidade histórica.';

-- ── 2. Backfill ──────────────────────────────────────────────────────────────────
-- Sessões concluídas são protegidas pelos triggers de imutabilidade (s85); este é um processo
-- oficial de manutenção e faz o opt-in explícito previsto por eles.
do $$
begin
    perform set_config('app.allow_history_mutation', 'on', true);

    -- 2a. Composição da rotina (a partir da definição atual — ver limitação no cabeçalho)
    update public.checklist_assumptions a
       set tasks_snapshot = coalesce((
               select jsonb_agg(
                          jsonb_build_object(
                              'task_id',              t.id,
                              'title',                t.title,
                              'description',          t.description,
                              'is_critical',          coalesce(t.is_critical, false),
                              'requires_photo',       coalesce(t.requires_photo, false),
                              'requires_observation', coalesce(t.requires_observation, false),
                              'type',                 coalesce(t.type, 'boolean'),
                              'max_photos',           t.max_photos,
                              'task_config',          t.task_config,
                              'order',                coalesce(t."order", 0)
                          )
                          order by coalesce(t."order", 0) asc, t.created_at asc
                      )
                 from public.checklist_tasks t
                where t.checklist_id = a.checklist_id
           ), '[]'::jsonb)
     where a.tasks_snapshot is null;

    -- 2b. Snapshots de identidade da tarefa (s84) ainda nulos — o histórico precisa ser
    --     renderizável sem depender da definição viva (pré-requisito da s89).
    update public.task_executions te
       set task_title_snapshot       = coalesce(te.task_title_snapshot, ct.title),
           task_description_snapshot = coalesce(te.task_description_snapshot, ct.description),
           is_critical_snapshot      = coalesce(te.is_critical_snapshot, ct.is_critical, false)
      from public.checklist_tasks ct
     where ct.id = te.task_id
       and (te.task_title_snapshot is null or te.is_critical_snapshot is null);
end $$;

-- ── 3. Índice ────────────────────────────────────────────────────────────────────
-- A auditoria lê o snapshot sempre junto da assumption (por id / por restaurant+date_key), que já
-- têm índice. Nenhum índice adicional é necessário sobre o jsonb.
