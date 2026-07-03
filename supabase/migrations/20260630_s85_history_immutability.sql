-- Sprint 85 — Imutabilidade do histórico auditável (triggers DELETE + UPDATE)
--
-- Princípio: depois que o PERÍODO OPERACIONAL de uma execução se encerra (a assumption/sessão
-- está concluída), seus dados (task_executions, checklist_assumptions, task_issues) tornam-se
-- imutáveis. Nenhuma rotina operacional pode apagá-los ou alterá-los. Correções do mesmo dia
-- (uncheck/unskip/resume) continuam permitidas porque ocorrem com a sessão AINDA ABERTA.
--
-- A regra NÃO depende de intervalo de tempo fixo — depende do fechamento do período (completed_at).
--
-- Escape explícito: processos oficiais (retenção de fotos, manutenção, teardown de testes) podem
-- setar `set_config('app.allow_history_mutation','on',true)` na própria transação para opt-in.
--
-- Pré-requisito: aplicar DEPOIS da s84 (snapshots + backfill), para o backfill não ser bloqueado.
--
-- Rollback:
--   drop trigger trg_guard_hist_task_exec on public.task_executions;
--   drop trigger trg_guard_hist_assumption on public.checklist_assumptions;
--   drop trigger trg_guard_hist_task_issue on public.task_issues;
--   drop function public.guard_history_task_exec();
--   drop function public.guard_history_assumption();
--   drop function public.guard_history_task_issue();
--   drop function public.history_is_locked(uuid, uuid, uuid, text);

-- ── Decisão de "período fechado" (sem tempo arbitrário) ─────────────────────────
create or replace function public.history_is_locked(
    p_assumption_id uuid,
    p_checklist_id  uuid,
    p_user_id       uuid,
    p_status        text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select case
        when p_status = 'doing' then false                      -- em andamento: nunca travado
        when p_assumption_id is not null then exists (           -- vinculado: travado se a sessão concluiu
            select 1 from public.checklist_assumptions a
             where a.id = p_assumption_id and a.completed_at is not null)
        else not exists (                                       -- legado sem vínculo: travado se não há sessão aberta
            select 1 from public.checklist_assumptions a
             where a.checklist_id = p_checklist_id
               and a.user_id = p_user_id
               and a.completed_at is null)
    end;
$$;

create or replace function public.history_mutation_allowed()
returns boolean
language sql
stable
as $$
    select coalesce(current_setting('app.allow_history_mutation', true), '') = 'on';
$$;

-- ── task_executions: bloqueia UPDATE e DELETE de execução de período fechado ─────
create or replace function public.guard_history_task_exec()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.history_mutation_allowed() then
        return coalesce(new, old);
    end if;
    if public.history_is_locked(old.checklist_assumption_id, old.checklist_id, old.user_id, old.status) then
        raise exception 'IMUTABILIDADE: histórico auditável não pode ser % (task_execution %).', tg_op, old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para retenção/manutenção intencional.';
    end if;
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_hist_task_exec on public.task_executions;
create trigger trg_guard_hist_task_exec
    before update or delete on public.task_executions
    for each row execute function public.guard_history_task_exec();

-- ── checklist_assumptions: sessão concluída é imutável ───────────────────────────
create or replace function public.guard_history_assumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.history_mutation_allowed() then
        return coalesce(new, old);
    end if;
    -- A transição de finalização (completed_at null -> preenchido) tem OLD.completed_at null => permitida.
    if old.completed_at is not null then
        raise exception 'IMUTABILIDADE: sessão concluída não pode ser % (checklist_assumption %).', tg_op, old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para manutenção intencional.';
    end if;
    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_hist_assumption on public.checklist_assumptions;
create trigger trg_guard_hist_assumption
    before update or delete on public.checklist_assumptions
    for each row execute function public.guard_history_assumption();

-- ── task_issues: registro da ocorrência é imutável; resolução continua permitida ──
-- DELETE sempre bloqueado (ocorrências não são apagadas por rotina operacional).
-- UPDATE: bloqueia alteração das colunas do REGISTRO; permite colunas de resolução/reabertura.
create or replace function public.guard_history_task_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.history_mutation_allowed() then
        return coalesce(new, old);
    end if;
    if tg_op = 'DELETE' then
        raise exception 'IMUTABILIDADE: ocorrência (task_issue %) não pode ser apagada.', old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para manutenção intencional.';
    end if;
    -- UPDATE: só pode alterar status/comentário/resolução/reabertura. O registro original é imutável.
    if new.description       is distinct from old.description
       or new.photos            is distinct from old.photos
       or new.task_id           is distinct from old.task_id
       or new.checklist_id      is distinct from old.checklist_id
       or new.reported_by       is distinct from old.reported_by
       or new.created_at        is distinct from old.created_at
       or new.task_execution_id is distinct from old.task_execution_id
    then
        raise exception 'IMUTABILIDADE: registro original da ocorrência (task_issue %) é imutável.', old.id
            using hint = 'Apenas status/comentário/resolução podem mudar.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_guard_hist_task_issue on public.task_issues;
create trigger trg_guard_hist_task_issue
    before update or delete on public.task_issues
    for each row execute function public.guard_history_task_issue();

-- ── Retenção de fotos: processo oficial de retenção faz opt-in explícito ──────────
-- Reaplica purge_evidence_photo_refs (s81) adicionando o flag de mutação no início, para que os
-- UPDATEs legítimos de fotos em linhas concluídas não sejam bloqueados pelos triggers acima.
create or replace function public.purge_evidence_photo_refs(p_paths text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_photo_url_cleared int := 0;
    v_exec_photos_updated int := 0;
    v_issues_updated int := 0;
begin
    -- Opt-in: este é o processo oficial de retenção (remove apenas fotos > período), autorizado a
    -- mutar referências de foto em registros já concluídos.
    perform set_config('app.allow_history_mutation', 'on', true);

    if p_paths is null or array_length(p_paths, 1) is null then
        return jsonb_build_object('photo_url_cleared', 0, 'exec_photos_updated', 0, 'issues_updated', 0);
    end if;

    update task_executions
       set photo_url = null,
           requires_photo_snapshot = false
     where photo_url = any(p_paths);
    get diagnostics v_photo_url_cleared = row_count;

    update task_executions te
       set photos = coalesce((
                select jsonb_agg(elem)
                  from jsonb_array_elements_text(te.photos) elem
                 where elem <> all(p_paths)
            ), '[]'::jsonb)
     where te.photos is not null
       and jsonb_typeof(te.photos) = 'array'
       and exists (
            select 1 from jsonb_array_elements_text(te.photos) e
             where e = any(p_paths)
       );
    get diagnostics v_exec_photos_updated = row_count;

    update task_issues ti
       set photos = (
                select coalesce(array_agg(elem), '{}')
                  from unnest(ti.photos) elem
                 where elem <> all(p_paths)
            )
     where ti.photos is not null
       and ti.photos && p_paths;
    get diagnostics v_issues_updated = row_count;

    return jsonb_build_object(
        'photo_url_cleared', v_photo_url_cleared,
        'exec_photos_updated', v_exec_photos_updated,
        'issues_updated', v_issues_updated
    );
end;
$$;

revoke all on function public.purge_evidence_photo_refs(text[]) from public, anon, authenticated;
grant execute on function public.purge_evidence_photo_refs(text[]) to service_role;

-- ── Caminho de manutenção EXPLÍCITO (service_role) ───────────────────────────────
-- Único meio sancionado de remover histórico auditável (ex.: expurgo intencional de dados de
-- tenant, limpeza de ambiente de teste). Seta o opt-in na própria transação para que os triggers
-- permitam. NÃO é chamado por nenhuma rotina operacional do app.
create or replace function public.admin_purge_history_for_restaurants(p_restaurant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform set_config('app.allow_history_mutation', 'on', true);
    delete from task_issues          where restaurant_id = any(p_restaurant_ids);
    delete from task_executions      where restaurant_id = any(p_restaurant_ids);
    delete from checklist_assumptions where restaurant_id = any(p_restaurant_ids);
end;
$$;

revoke all on function public.admin_purge_history_for_restaurants(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_purge_history_for_restaurants(uuid[]) to service_role;
