-- Sprint 86 — Retenção de histórico de execução (apaga histórico > N dias)
--
-- Política: para evitar crescimento indefinido do banco, o histórico de execução com mais de
-- N dias (default 60) é removido — task_executions, checklist_assumptions, task_issues
-- (task_issue_events cai por CASCADE). Vale para TODOS os tipos (inclusive recebimento).
--
-- Coerente com o Princípio da Imutabilidade (s85): rotinas operacionais não podem apagar histórico,
-- mas este é o PROCESSO EXPLÍCITO de retenção, autorizado a remover dados após o período oficial.
-- Por isso seta o opt-in `app.allow_history_mutation` na própria transação.
--
-- SEGURANÇA (nunca tocar):
--   • checklists / checklist_tasks         (definição da rotina)
--   • receiving_templates / *_tasks/_shifts e os checklists checklist_type='receiving'
--                                          (o "recebimento em si"; receiving_expectations foi
--                                           removida no s60 — recebimento hoje é checklist+template)
--   • qualquer linha com < N dias           (nada atual)
-- A função só deleta as 3 tabelas de histórico; tudo acima fica fora do alcance por construção.
--
-- Ordem de deleção (respeita FKs, robusta a NO ACTION ou SET NULL em PROD/NONPROD):
--   task_issues -> task_executions -> checklist_assumptions
--
-- Rollback: drop function public.purge_expired_history(int, boolean);

create or replace function public.purge_expired_history(
    retention_days int default 60,
    dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cutoff timestamptz := now() - make_interval(days => retention_days);
    v_issues int := 0;
    v_execs int := 0;
    v_assumptions int := 0;
    v_photo_paths text[] := '{}';
begin
    if dry_run then
        return jsonb_build_object(
            'dry_run', true,
            'retention_days', retention_days,
            'cutoff', v_cutoff,
            'issues', (select count(*) from task_issues where created_at < v_cutoff),
            'executions', (select count(*) from task_executions where executed_at < v_cutoff),
            'assumptions', (select count(*) from checklist_assumptions
                             where coalesce(completed_at, assumed_at) < v_cutoff)
        );
    end if;

    -- Processo oficial de retenção: libera os triggers de imutabilidade nesta transação.
    perform set_config('app.allow_history_mutation', 'on', true);

    -- Coleta os paths de foto das linhas que serão apagadas (para o route remover do Storage).
    select coalesce(array_agg(distinct p), '{}') into v_photo_paths
    from (
        select photo_url as p from task_executions
         where executed_at < v_cutoff and photo_url is not null
        union all
        select jsonb_array_elements_text(photos) as p from task_executions
         where executed_at < v_cutoff and photos is not null and jsonb_typeof(photos) = 'array'
        union all
        select unnest(photos) as p from task_issues
         where created_at < v_cutoff and photos is not null
    ) s
    where p is not null and p <> '';

    -- Deleção na ordem segura (task_issue_events cai por CASCADE de task_issues).
    delete from task_issues where created_at < v_cutoff;
    get diagnostics v_issues = row_count;

    delete from task_executions where executed_at < v_cutoff;
    get diagnostics v_execs = row_count;

    delete from checklist_assumptions where coalesce(completed_at, assumed_at) < v_cutoff;
    get diagnostics v_assumptions = row_count;

    return jsonb_build_object(
        'dry_run', false,
        'retention_days', retention_days,
        'cutoff', v_cutoff,
        'issues_deleted', v_issues,
        'executions_deleted', v_execs,
        'assumptions_deleted', v_assumptions,
        'photo_paths', to_jsonb(v_photo_paths)
    );
end;
$$;

revoke all on function public.purge_expired_history(int, boolean) from public, anon, authenticated;
grant execute on function public.purge_expired_history(int, boolean) to service_role;
