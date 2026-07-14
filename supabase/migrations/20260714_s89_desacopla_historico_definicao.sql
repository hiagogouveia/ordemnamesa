-- Sprint 89 — Desacopla o histórico auditável da definição viva da rotina
--
-- PRÉ-REQUISITO: s88 (tasks_snapshot + backfill dos snapshots de identidade em task_executions).
-- Sem ela, apagar uma tarefa faria o relatório do dia perder a linha.
--
-- PROBLEMA
-- `task_executions.task_id` e `task_issues.task_id` apontam para `checklist_tasks` com
-- ON DELETE CASCADE (s75). Ou seja: apagar a definição de uma tarefa APAGARIA o histórico dela
-- (execuções, fotos, ocorrências). Na prática nem chega a apagar — os triggers de imutabilidade
-- (s85) disparam no delete cascateado e levantam exceção. Resultado: tarefa com histórico é
-- indeletável, e a API silenciosamente ignorava o pedido de remoção (a tarefa "voltava").
--
-- DECISÃO
-- Uma FK afirma "esta referência sempre aponta para uma linha existente". O requisito é o oposto:
-- "a definição pode ser apagada e o histórico sobrevive". As duas coisas são incompatíveis —
-- nenhuma cláusula de FK expressa isso:
--   • ON DELETE SET NULL → o cascade é um UPDATE em linha travada; os triggers da s85 barram
--     (e mutar o task_id de execuções passadas é, em si, corromper o histórico).
--   • ON DELETE RESTRICT → é o comportamento atual. Rejeitado.
--   • Versionar a definição → preserva a FK, mas nada é apagado de fato; é soft delete com mais
--     máquina, e obriga toda leitura de "tarefas atuais" a resolver versão.
--
-- Removemos a FK e preservamos a garantia que de fato importa — a de que uma execução nunca NASCE
-- apontando para uma tarefa inexistente — com um trigger BEFORE INSERT. Integridade referencial no
-- momento da ESCRITA; liberdade de deleção depois.
--
-- O histórico é auto-suficiente: `task_executions` carrega os snapshots de identidade da tarefa
-- (s84) e a sessão carrega a composição da rotina (s88). Nada nas telas depende mais do join com
-- `checklist_tasks` — inclusive o join era pior, porque mostrava o título ATUAL da tarefa.
--
-- ⚠️ PONTO DE NÃO-RETORNO: depois que a primeira tarefa com histórico for apagada, as FKs não
-- podem ser recriadas sem antes limpar as referências pendentes.
--
-- Rollback (só antes da primeira deleção):
--   drop trigger trg_assert_task_exists_exec  on public.task_executions;
--   drop trigger trg_assert_task_exists_issue on public.task_issues;
--   drop function public.assert_task_exists();
--   alter table public.task_executions add constraint task_executions_task_id_fkey
--       foreign key (task_id) references public.checklist_tasks(id) on delete cascade;
--   alter table public.task_issues add constraint task_issues_task_id_fkey
--       foreign key (task_id) references public.checklist_tasks(id) on delete cascade;

-- ── 1. Remove o vínculo rígido histórico → definição ─────────────────────────────
alter table public.task_executions drop constraint if exists task_executions_task_id_fkey;
alter table public.task_issues     drop constraint if exists task_issues_task_id_fkey;

comment on column public.task_executions.task_id is
    'Referência HISTÓRICA à tarefa (s89): sem FK — a definição pode ter sido removida da rotina. '
    'A identidade da tarefa no momento da execução está nos snapshots (task_title_snapshot etc.).';
comment on column public.task_issues.task_id is
    'Referência HISTÓRICA à tarefa (s89): sem FK — a definição pode ter sido removida da rotina.';

-- ── 2. Integridade na ESCRITA (o que a FK realmente protegia) ────────────────────
create or replace function public.assert_task_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.task_id is not null
       and not exists (select 1 from public.checklist_tasks t where t.id = new.task_id)
    then
        raise exception 'task_id % não existe em checklist_tasks (integridade na escrita — s89).', new.task_id
            using errcode = '23503';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_assert_task_exists_exec on public.task_executions;
create trigger trg_assert_task_exists_exec
    before insert on public.task_executions
    for each row execute function public.assert_task_exists();

drop trigger if exists trg_assert_task_exists_issue on public.task_issues;
create trigger trg_assert_task_exists_issue
    before insert on public.task_issues
    for each row execute function public.assert_task_exists();

-- ── 3. Índices em task_id ────────────────────────────────────────────────────────
-- Postgres não cria índice para a coluna referenciante de uma FK, e não havia nenhum: a auditoria
-- (dedup por task) e o histórico varriam a tabela. Sem a FK, o índice passa a ser a única
-- estrutura que sustenta as buscas por task_id.
create index if not exists idx_task_executions_task_id on public.task_executions (task_id);
create index if not exists idx_task_issues_task_id     on public.task_issues (task_id);
