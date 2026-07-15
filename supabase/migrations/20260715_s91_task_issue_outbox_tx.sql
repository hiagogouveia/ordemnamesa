-- s91 (F7) — OUTBOX TRANSACIONAL para a criação de ocorrência.
--
-- Antes: POST /api/task-issues fazia 3 escritas SEPARADAS e não-transacionais —
--   1) INSERT task_issues (o fato de negócio)
--   2) INSERT task_issue_events (auditoria)
--   3) upsert domain_events (a linha do outbox que vira notificação)
-- Um crash entre (1) e (3) deixava uma ocorrência SEM evento → notificação que nunca
-- acontece, sem trilha e sem retry. Não era um outbox transacional de verdade.
--
-- Agora: este RPC faz as três escritas numa ÚNICA transação (funções PL/pgSQL são
-- transacionais por padrão). Ou tudo é gravado, ou nada. O domain_events nasce junto com
-- a ocorrência — e o worker/cron é a rede de segurança que materializa se o fast-path
-- inline falhar.
--
-- O `id` da ocorrência é gerado pela aplicação (crypto.randomUUID) e passado aqui, para
-- que o payload da notificação — que referencia o issue_id — seja montado ANTES da
-- transação, sem galinha-e-ovo. O dedup do outbox é preservado (ON CONFLICT DO NOTHING no
-- índice UNIQUE(event_type, dedup_key)): retry de rota e double-submit continuam no-op.

create or replace function report_task_issue_tx(
    p_issue_id uuid,
    p_restaurant_id uuid,
    p_task_id uuid,
    p_checklist_id uuid,
    p_checklist_assumption_id uuid,
    p_task_execution_id uuid,
    p_reported_by uuid,
    p_description text,
    p_photos text[],
    p_severity text,
    p_actor_user_id uuid,
    p_event_type text,
    p_dedup_key text,
    p_payload jsonb,
    p_payload_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_issue task_issues;
    v_event domain_events;
begin
    insert into task_issues (
        id, restaurant_id, task_id, checklist_id, checklist_assumption_id,
        task_execution_id, reported_by, description, photos, status, severity
    ) values (
        p_issue_id, p_restaurant_id, p_task_id, p_checklist_id, p_checklist_assumption_id,
        p_task_execution_id, p_reported_by, p_description, coalesce(p_photos, '{}'::text[]),
        'open', p_severity
    )
    returning * into v_issue;

    insert into task_issue_events (
        task_issue_id, restaurant_id, event_type, to_status, actor_user_id, metadata
    ) values (
        p_issue_id, p_restaurant_id, 'created', 'open', p_actor_user_id,
        jsonb_build_object('source', 'api')
    );

    -- O dedup do outbox: se o mesmo fato já foi registrado, não duplica (no-op).
    insert into domain_events (
        restaurant_id, event_type, dedup_key, payload, payload_version, actor_user_id
    ) values (
        p_restaurant_id, p_event_type, p_dedup_key, p_payload, p_payload_version, p_actor_user_id
    )
    on conflict (event_type, dedup_key) do nothing
    returning * into v_event;

    -- v_event é NULL quando o evento já existia (deduped) → o chamador não materializa.
    return jsonb_build_object(
        'issue', to_jsonb(v_issue),
        'domain_event', to_jsonb(v_event)
    );
end;
$$;

-- Só o servidor (service_role) chama. Nunca exposto a anon/authenticated via PostgREST.
revoke all on function report_task_issue_tx(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text[], text, uuid, text, text, jsonb, integer
) from anon, authenticated;
