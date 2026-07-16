-- ═══════════════════════════════════════════════════════════════════════════
-- schema-storage.sql — SUPLEMENTO do snapshot de DR: objetos de STORAGE.
--
-- O `supabase db dump` exclui os schemas gerenciados (auth, storage, ...), então o
-- bucket de fotos e as RLS policies de storage.objects ficam FORA do schema.sql.
-- Este arquivo os repõe. Extraído do banco vivo (pg_policies + storage.buckets) na
-- s91/F8d — as definições EXATAS em produção de fato.
--
-- Uso em DR: aplicar DEPOIS do schema.sql (as policies dependem da função
-- public.is_restaurant_member, criada lá). Idempotente no bucket (on conflict).
-- Origem histórica: migrations s55 (bucket) e s78 (RLS por tenant).
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, '{image/jpeg,image/png}')
on conflict (id) do nothing;

create policy "Authenticated users can read photos" on storage.objects
  for select to authenticated
  using (((bucket_id = 'photos'::text)
    AND ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text)
    AND is_restaurant_member(((storage.foldername(name))[1])::uuid)));

create policy "Authenticated users can upload photos" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'photos'::text)
    AND ((storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'::text)
    AND is_restaurant_member(((storage.foldername(name))[1])::uuid)));
