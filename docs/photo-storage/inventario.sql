-- Inventário do bucket 'photos' (Supabase Storage).
-- Somente leitura. Rode via Supabase MCP (execute_sql) ou psql contra o projeto.
-- As fotos são referenciadas em 3 lugares:
--   task_executions.photo_url (text, legado), task_executions.photos (jsonb array),
--   task_issues.photos (text[]). Path puro: restaurant_id/execution_id/arquivo.jpg

-- 1) Totais gerais do bucket.
select
    count(*)                                              as total_objetos,
    pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as tamanho_total,
    pg_size_pretty(coalesce(round(avg((metadata->>'size')::numeric)), 0)::bigint) as media_por_foto,
    pg_size_pretty(coalesce(max((metadata->>'size')::bigint), 0)) as maior_arquivo,
    min(created_at) as primeiro_upload,
    max(created_at) as ultimo_upload
from storage.objects
where bucket_id = 'photos';

-- 2) Quebra por restaurante (tenant) + idade (alvo da retenção de 2 meses).
select
    split_part(name, '/', 1) as restaurant_id,
    count(*)                 as fotos,
    pg_size_pretty(sum((metadata->>'size')::bigint)) as tamanho_total,
    pg_size_pretty(round(avg((metadata->>'size')::numeric))::bigint) as media,
    count(*) filter (where created_at <  now() - interval '2 months') as mais_de_2_meses,
    count(*) filter (where created_at >= now() - interval '2 months') as recentes
from storage.objects
where bucket_id = 'photos'
group by 1
order by sum((metadata->>'size')::bigint) desc;

-- 3) Órfãos: arquivos no Storage sem nenhuma referência no banco.
--    (objetos_storage − união das 3 fontes de referência)
with referenced as (
    select photo_url as path from task_executions where photo_url is not null
    union
    select jsonb_array_elements_text(photos) from task_executions where jsonb_typeof(photos) = 'array'
    union
    select unnest(photos) from task_issues where photos is not null
),
ref_norm as (
    select distinct
        case when path like '%/photos/%' then split_part(path, '/photos/', 2) else path end as path
    from referenced
    where path is not null
)
select
    (select count(*) from storage.objects where bucket_id = 'photos') as objetos_storage,
    (select count(*) from ref_norm)                                   as refs_banco,
    (select count(*) from storage.objects o
        where bucket_id = 'photos'
          and not exists (select 1 from ref_norm r where r.path = o.name)) as orfaos_reais,
    (select count(*) from ref_norm r
        where not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = r.path)) as refs_quebradas;

-- 4) Listar os paths órfãos (para conferência antes de remover — ver scripts/cleanup-orphan-photos.mjs).
with referenced as (
    select photo_url as path from task_executions where photo_url is not null
    union
    select jsonb_array_elements_text(photos) from task_executions where jsonb_typeof(photos) = 'array'
    union
    select unnest(photos) from task_issues where photos is not null
),
ref_norm as (
    select distinct
        case when path like '%/photos/%' then split_part(path, '/photos/', 2) else path end as path
    from referenced
    where path is not null
)
select o.name as path, pg_size_pretty((o.metadata->>'size')::bigint) as tamanho, o.created_at
from storage.objects o
where o.bucket_id = 'photos'
  and not exists (select 1 from ref_norm r where r.path = o.name)
order by o.created_at;
