-- s80 — Funções de apoio à retenção de fotos de evidência.
--
-- Contexto: o bucket privado 'photos' cresce indefinidamente (nenhuma limpeza).
-- Estas funções dão suporte à rotina recorrente /api/cron/photo-retention, que
-- remove evidências com mais de N dias preservando o registro de execução.
--
-- Ambas são SECURITY DEFINER (precisam ler storage.objects / escrever nas tabelas
-- ignorando RLS) e ficam RESTRITAS ao service_role — nunca expostas a anon/authenticated.

-- 1) Lista os paths de arquivos do bucket 'photos' mais antigos que o corte.
--    Baseado na idade do ARQUIVO (storage.objects.created_at): captura tanto fotos
--    ainda referenciadas quanto órfãs antigas.
create or replace function public.expired_evidence_photo_paths(retention_days int)
returns setof text
language sql
security definer
set search_path = storage, public
as $$
    select name
      from storage.objects
     where bucket_id = 'photos'
       and created_at < now() - make_interval(days => retention_days);
$$;

-- 2) Remove referências aos paths informados, preservando a linha de execução/ocorrência.
--    Ordem do fluxo (na rota): zerar refs PRIMEIRO, depois apagar os arquivos. Assim uma
--    falha parcial gera no máximo órfão (limpo na próxima rodada), nunca referência quebrada.
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
    if p_paths is null or array_length(p_paths, 1) is null then
        return jsonb_build_object('photo_url_cleared', 0, 'exec_photos_updated', 0, 'issues_updated', 0);
    end if;

    -- task_executions.photo_url (legado, single)
    update task_executions
       set photo_url = null
     where photo_url = any(p_paths);
    get diagnostics v_photo_url_cleared = row_count;

    -- task_executions.photos (jsonb array) — remove só os paths expirados
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

    -- task_issues.photos (text[]) — remove só os paths expirados
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

-- Bloqueia execução por papéis públicos; libera apenas para o service_role (usado server-side).
revoke all on function public.expired_evidence_photo_paths(int) from public, anon, authenticated;
revoke all on function public.purge_evidence_photo_refs(text[]) from public, anon, authenticated;
grant execute on function public.expired_evidence_photo_paths(int) to service_role;
grant execute on function public.purge_evidence_photo_refs(text[]) to service_role;
