-- s78: tenant isolation no bucket 'photos'.
-- As policies de s55 permitiam que QUALQUER usuário autenticado lesse/enviasse
-- qualquer foto. A convenção de path é {restaurant_id}/{execution_id}/{ts}.{ext}
-- (lib/supabase/storage.ts), então a primeira pasta identifica o tenant.
-- Padrão s40: validação de membership via public.is_restaurant_member().
-- O CASE protege o cast ::uuid — path fora da convenção é negado, nunca erro.

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "photos: membro envia no proprio restaurante"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'photos'
        AND CASE
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    );

DROP POLICY IF EXISTS "Authenticated users can read photos" ON storage.objects;
CREATE POLICY "photos: membro le do proprio restaurante"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'photos'
        AND CASE
            WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
            ELSE false
        END
    );
