-- Sprint 95 — Exclusão permanente de colaborador.
--
-- Contexto: hoje só existe INATIVAR (restaurant_users.active = false), o que é correto para
-- quem já operou mas deixa lixo permanente no cadastro inicial (colaborador criado por engano,
-- duplicado, usuário de teste). Esta migration adiciona exclusão permanente PERMITIDA APENAS
-- quando o colaborador não deixou nenhum rastro operacional auditável.
--
-- Princípio: se remover o usuário causar perda de histórico ou quebrar a auditoria, a operação
-- é RECUSADA e o gestor deve usar Inativar. Nada de ON DELETE CASCADE sobre dado histórico.
--
-- Por que uma função e não N queries no route handler: supabase-js não expõe transação. Checar
-- e apagar em chamadas separadas permitiria um estado intermediário (vínculo/áreas/turnos já
-- apagados e cadastro vivo) se o DELETE final falhasse por FK numa corrida. Aqui, ou tudo
-- commita ou nada muda — e as 12 FKs NO ACTION viram segunda linha de defesa: se este catálogo
-- de bloqueadores ficar desatualizado, o banco levanta 23503 e a transação inteira volta atrás.
--
-- Classificação das relações (decisão de produto, sprint 95):
--   BLOQUEIA  → rastro operacional: execuções, assunções, ocorrências, transferências,
--               autoria (created_by), propriedade de unidade, auditoria administrativa.
--   DESVINCULA→ configuração reatribuível: responsáveis, atribuições, áreas, turnos, cargos,
--               notificações e canais.
--   PRESERVA  → event_logs (FK SET NULL) e admin_audit_log.target_user_id (sem FK) sobrevivem
--               ao usuário apagado, mantendo a trilha intacta.
--
-- A identidade (public.users) só é apagada quando o colaborador não sobra em NENHUMA outra
-- unidade e não tem rastro global. auth.users é removido pela rota, DEPOIS desta função —
-- nesta ordem a operação funciona tanto em NONPROD (users.id -> auth.users CASCADE) quanto em
-- PROD (NO ACTION). Nunca o inverso: em NONPROD o CASCADE pularia toda a checagem abaixo.
--
-- Rollback:
--   drop function public.delete_restaurant_member(uuid, uuid, uuid, boolean);
--   drop function public.restaurant_member_deletion_blockers(uuid, uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de rastro operacional (read-only)
--
-- Usado TANTO pelo preview (dry run) QUANTO pela execução — é impossível os dois divergirem.
-- p_restaurant_id NULL = varredura global (decide se a identidade pode morrer).
-- Cada sonda usa `limit 101`: a UI só precisa de "42" ou "100+", e um count(*) irrestrito
-- varreria a tabela inteira de task_executions para um colaborador antigo.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.restaurant_member_deletion_blockers(
    p_user_id       uuid,
    p_restaurant_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with probes(key, n) as (
        -- Execuções de tarefa (cobre fotos: task_executions.photos / photo_url)
        select 'task_executions'::text, (select count(*) from (
            select 1 from public.task_executions t
             where (t.user_id = p_user_id or t.blocked_by_user_id = p_user_id)
               and (p_restaurant_id is null or t.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- Rotinas assumidas / concluídas (sem FK: este é o bloqueador mais crítico)
        select 'checklist_assumptions'::text, (select count(*) from (
            select 1 from public.checklist_assumptions a
             where (a.user_id = p_user_id or a.completed_by_user_id = p_user_id)
               and (p_restaurant_id is null or a.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- Ocorrências (cobre fotos: task_issues.photos)
        select 'task_issues'::text, (select count(*) from (
            select 1 from public.task_issues i
             where (i.reported_by = p_user_id or i.resolved_by = p_user_id or i.reopened_by = p_user_id)
               and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        select 'task_issue_events'::text, (select count(*) from (
            select 1 from public.task_issue_events e
             where e.actor_user_id = p_user_id
               and (p_restaurant_id is null or e.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- Ledger de transferência temporária (s94): FKs CASCADE apagariam o registro silenciosamente
        select 'checklist_temporary_transfers'::text, (select count(*) from (
            select 1 from public.checklist_temporary_transfers tt
             where (tt.original_user_id = p_user_id or tt.temporary_user_id = p_user_id
                    or tt.created_by = p_user_id or tt.ended_by = p_user_id)
               and (p_restaurant_id is null or tt.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- Autoria de rotina (created_by é NOT NULL — não dá para desvincular)
        select 'checklists_created'::text, (select count(*) from (
            select 1 from public.checklists c
             where c.created_by = p_user_id
               and (p_restaurant_id is null or c.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        select 'receiving_templates_created'::text, (select count(*) from (
            select 1 from public.receiving_templates rt
             where rt.created_by = p_user_id
               and (p_restaurant_id is null or rt.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        select 'suppliers_created'::text, (select count(*) from (
            select 1 from public.suppliers sp
             where sp.created_by = p_user_id
               and (p_restaurant_id is null or sp.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- Propriedade de unidade (restaurants.owner_id é NO ACTION)
        select 'restaurants_owned'::text, (select count(*) from (
            select 1 from public.restaurants r
             where r.owner_id = p_user_id
               and (p_restaurant_id is null or r.id = p_restaurant_id)
             limit 101) s)
        union all
        -- Auditoria administrativa: ator (target_user_id NÃO conta — ter sofrido uma ação
        -- administrativa não é rastro operacional do próprio usuário)
        select 'admin_audit_log'::text, (select count(*) from (
            select 1 from public.admin_audit_log al
             where al.actor_id = p_user_id
               and (p_restaurant_id is null or al.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        select 'data_export_events'::text, (select count(*) from (
            select 1 from public.data_export_events de
             where de.actor_id = p_user_id
               and (p_restaurant_id is null or de.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        select 'domain_events'::text, (select count(*) from (
            select 1 from public.domain_events dv
             where dv.actor_user_id = p_user_id
               and (p_restaurant_id is null or dv.restaurant_id = p_restaurant_id)
             limit 101) s)
        union all
        -- ── Sem tenant: só pesam na varredura global (decisão sobre a identidade) ──
        select 'ordemnamesa_staff'::text, (case when p_restaurant_id is null then (
            select count(*) from public.ordemnamesa_staff os where os.user_id = p_user_id) else 0 end)
        union all
        select 'leads_approved'::text, (case when p_restaurant_id is null then (
            select count(*) from public.leads l where l.approved_user_id = p_user_id) else 0 end)
        union all
        select 'account_owner'::text, (case when p_restaurant_id is null then (
            select count(*) from public.account_users au
             where au.user_id = p_user_id and au.role = 'owner' and au.active) else 0 end)
    )
    select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', n) order by n desc, key),
        '[]'::jsonb)
      from probes
     where n > 0;
$$;

comment on function public.restaurant_member_deletion_blockers(uuid, uuid) is
    'Sprint 95 — catálogo de rastro operacional que impede a exclusão permanente de um colaborador. '
    'p_restaurant_id NULL = varredura global. Contagens saturam em 101 (a UI exibe "100+").';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Operação transacional
--
-- Retorna jsonb {ok, code, ...} em vez de raise para os casos de negócio: todos os returns
-- antecipados acontecem ANTES de qualquer escrita, então não há nada a desfazer e o TS não
-- precisa parsear string de exceção. `raise` fica para o inesperado (23503, P0001), que a
-- rota mapeia para 409.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_restaurant_member(
    p_restaurant_id  uuid,
    p_target_user_id uuid,
    p_actor_user_id  uuid,
    p_dry_run        boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_role       text;
    v_target           public.restaurant_users%rowtype;
    v_account_id       uuid;
    v_email            text;
    v_name             text;
    v_blockers         jsonb;
    v_remaining_units  integer;
    v_kept_reason      text := null;
    v_identity_deleted boolean := false;
    v_unlink_cl        integer;
    v_unlink_rt        integer;
begin
    -- ── Autorização resolvida NO BANCO. service_role bypassa RLS, então o papel do ator
    --    nunca pode vir do cliente.
    select ru.role into v_actor_role
      from public.restaurant_users ru
     where ru.restaurant_id = p_restaurant_id
       and ru.user_id = p_actor_user_id
       and ru.active;

    if v_actor_role is null or v_actor_role not in ('owner', 'manager') then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;

    if p_actor_user_id = p_target_user_id then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_SELF_DELETE');
    end if;

    -- ── Trava o vínculo: serializa duas exclusões concorrentes do MESMO membro.
    select * into v_target
      from public.restaurant_users ru
     where ru.restaurant_id = p_restaurant_id
       and ru.user_id = p_target_user_id
     for update;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'MEMBER_NOT_FOUND');
    end if;

    -- Owner nunca é excluído (usar Inativar) — protege o dono e o último administrador.
    if v_target.role = 'owner' then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_TARGET_OWNER');
    end if;

    if v_actor_role = 'manager' and v_target.role <> 'staff' then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_MANAGER_SCOPE');
    end if;

    select u.email, u.name into v_email, v_name
      from public.users u where u.id = p_target_user_id;

    select r.account_id into v_account_id
      from public.restaurants r where r.id = p_restaurant_id;

    -- ── BLOQUEIO (escopo da unidade) ──
    v_blockers := public.restaurant_member_deletion_blockers(p_target_user_id, p_restaurant_id);
    if jsonb_array_length(v_blockers) > 0 then
        return jsonb_build_object('ok', false, 'code', 'MEMBER_HAS_HISTORY', 'blockers', v_blockers);
    end if;

    -- ── Projeção da identidade: mesma lógica no preview e na execução (sem drift possível) ──
    select count(*) into v_remaining_units
      from public.restaurant_users ru
     where ru.user_id = p_target_user_id
       and ru.restaurant_id <> p_restaurant_id;

    if v_remaining_units > 0 then
        v_kept_reason := 'other_units';
    elsif jsonb_array_length(
            public.restaurant_member_deletion_blockers(p_target_user_id, null)) > 0 then
        v_kept_reason := 'global_traces';
    end if;

    -- Quantas rotinas/modelos ficarão sem responsável (informado no modal ANTES de confirmar)
    select count(*) into v_unlink_cl
      from public.checklist_responsibles cr
     where cr.user_id = p_target_user_id and cr.restaurant_id = p_restaurant_id;

    select count(*) into v_unlink_rt
      from public.receiving_template_responsibles rtr
     where rtr.user_id = p_target_user_id and rtr.restaurant_id = p_restaurant_id;

    if p_dry_run then
        return jsonb_build_object(
            'ok', true,
            'code', 'CAN_DELETE',
            'blockers', '[]'::jsonb,
            'identity_deleted', v_kept_reason is null,
            'identity_kept_reason', v_kept_reason,
            'remaining_units', v_remaining_units,
            'unlinked', jsonb_build_object('checklists', v_unlink_cl, 'receiving_templates', v_unlink_rt),
            'target', jsonb_build_object(
                'user_id', p_target_user_id, 'email', v_email,
                'name', v_name, 'role', v_target.role));
    end if;

    -- ═══ A PARTIR DAQUI SÃO ESCRITAS ═══

    -- ── Desvínculo de configuração (escopo da unidade) ──
    -- Os triggers trg_sync_checklist_responsible_shadow / trg_sync_template_responsible_shadow
    -- (s92, AFTER DELETE) recalculam as colunas-sombra assigned_to_user_id automaticamente.
    delete from public.checklist_responsibles
     where user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    delete from public.receiving_template_responsibles
     where user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    -- Defensivo: linhas legadas com sombra preenchida mas sem row na tabela de responsáveis
    -- (a s92 tornou estas colunas derivadas, mas o backfill pode ter deixado resíduo).
    update public.checklists
       set assigned_to_user_id = null
     where assigned_to_user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    update public.receiving_templates
       set assigned_to_user_id = null
     where assigned_to_user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    update public.checklist_tasks
       set assigned_to_user_id = null
     where assigned_to_user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    delete from public.user_areas  where user_id = p_target_user_id and restaurant_id = p_restaurant_id;
    delete from public.user_shifts where user_id = p_target_user_id and restaurant_id = p_restaurant_id;
    delete from public.user_roles  where user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    delete from public.notifications where user_id = p_target_user_id and restaurant_id = p_restaurant_id;
    -- restaurant_id NULL = canal global do usuário: só sai na fase de identidade
    delete from public.notification_channels
     where user_id = p_target_user_id and restaurant_id = p_restaurant_id;

    -- ── O vínculo ──
    delete from public.restaurant_users where id = v_target.id;

    -- ── account_users: some se não sobrou nenhum vínculo na account; desativa se só sobrou
    --    staff (mesma semântica de mirrorAccountUserOnDowngrade em app/api/equipe/route.ts) ──
    if v_account_id is not null then
        if not exists (
            select 1 from public.restaurant_users ru
              join public.restaurants r on r.id = ru.restaurant_id
             where ru.user_id = p_target_user_id and r.account_id = v_account_id
        ) then
            delete from public.account_users
             where account_id = v_account_id and user_id = p_target_user_id;
        elsif not exists (
            select 1 from public.restaurant_users ru
              join public.restaurants r on r.id = ru.restaurant_id
             where ru.user_id = p_target_user_id and r.account_id = v_account_id
               and ru.active and ru.role in ('owner', 'manager')
        ) then
            update public.account_users set active = false
             where account_id = v_account_id and user_id = p_target_user_id and active;
        end if;
    end if;

    -- ── Identidade: só quando não sobrou nada em lugar nenhum ──
    if v_kept_reason is null then
        delete from public.user_areas           where user_id = p_target_user_id;
        delete from public.user_shifts          where user_id = p_target_user_id;
        delete from public.user_roles           where user_id = p_target_user_id;
        delete from public.notifications        where user_id = p_target_user_id;
        delete from public.notification_channels where user_id = p_target_user_id;
        delete from public.telegram_link_tokens where user_id = p_target_user_id;
        delete from public.account_users        where user_id = p_target_user_id;

        -- As FKs NO ACTION (task_executions, task_issues, checklists, ...) são a rede de
        -- segurança final: se o catálogo acima estiver incompleto, isto levanta 23503 e a
        -- transação inteira volta atrás.
        delete from public.users where id = p_target_user_id;
        v_identity_deleted := true;
    end if;

    -- ── Auditoria da própria exclusão, DENTRO da transação.
    --    admin_audit_log não tem nenhuma FK — é justamente isso que permite a linha sobreviver
    --    ao usuário apagado. metadata grava email/name, que somem de public.users no mesmo commit.
    insert into public.admin_audit_log (restaurant_id, actor_id, target_user_id, action, metadata)
    values (p_restaurant_id, p_actor_user_id, p_target_user_id, 'member_deleted',
            jsonb_build_object(
                'email', v_email,
                'name', v_name,
                'role', v_target.role,
                'identity_deleted', v_identity_deleted,
                'identity_kept_reason', v_kept_reason,
                'remaining_units', v_remaining_units,
                'unlinked', jsonb_build_object('checklists', v_unlink_cl,
                                               'receiving_templates', v_unlink_rt)));

    return jsonb_build_object(
        'ok', true,
        'code', 'DELETED',
        'identity_deleted', v_identity_deleted,
        'identity_kept_reason', v_kept_reason,
        'remaining_units', v_remaining_units,
        'unlinked', jsonb_build_object('checklists', v_unlink_cl, 'receiving_templates', v_unlink_rt),
        'target', jsonb_build_object(
            'user_id', p_target_user_id, 'email', v_email,
            'name', v_name, 'role', v_target.role));
end;
$$;

comment on function public.delete_restaurant_member(uuid, uuid, uuid, boolean) is
    'Sprint 95 — exclusão permanente de colaborador, transacional. Recusa se houver rastro '
    'operacional. p_dry_run = true retorna o preview sem escrever nada. auth.users é removido '
    'pela rota DEPOIS desta função (ordem obrigatória por causa do drift PROD/NONPROD da FK '
    'public.users.id -> auth.users).';


revoke all on function public.restaurant_member_deletion_blockers(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.delete_restaurant_member(uuid, uuid, uuid, boolean)
    from public, anon, authenticated;

grant execute on function public.restaurant_member_deletion_blockers(uuid, uuid) to service_role;
grant execute on function public.delete_restaurant_member(uuid, uuid, uuid, boolean) to service_role;
