-- s81 — Corrige purge_evidence_photo_refs (retenção de fotos).
--
-- Bug pego em homologação: zerar photo_url numa execução concluída com foto
-- obrigatória viola a constraint check_required_photo:
--   CHECK (NOT (requires_photo_snapshot = true AND status = 'done' AND photo_url IS NULL))
--
-- Decisão: a retenção preserva o REGISTRO de execução (histórico de que a tarefa
-- foi feita), removendo apenas a evidência (bytes + refs). Para manter o invariante,
-- ao expurgar a foto também marcamos requires_photo_snapshot = false — sinalizando
-- que aquele registro arquivado não carrega mais exigência de foto.
-- task_issues não tem constraint de foto, então segue igual.

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

    -- task_executions.photo_url (legado, single). Também zera requires_photo_snapshot
    -- para não violar check_required_photo ao remover a evidência.
    update task_executions
       set photo_url = null,
           requires_photo_snapshot = false
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

revoke all on function public.purge_evidence_photo_refs(text[]) from public, anon, authenticated;
grant execute on function public.purge_evidence_photo_refs(text[]) to service_role;
