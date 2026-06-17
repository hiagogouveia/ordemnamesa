-- s55: provisiona bucket 'photos' + policies de acesso para uploads de evidência
-- Idempotente: codifica o setup que existia manualmente em NONPROD e cria em PROD.

INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'photos');

DROP POLICY IF EXISTS "Authenticated users can read photos" ON storage.objects;
CREATE POLICY "Authenticated users can read photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'photos');
