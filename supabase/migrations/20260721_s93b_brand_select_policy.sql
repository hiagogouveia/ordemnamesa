-- Sprint 93b — Corrige upload da logo: faltava policy de SELECT no bucket 'brand'.
--
-- Sintoma: todo upload falhava com
--   "new row violates row-level security policy for table objects"
-- mesmo com o path correto e o usuário sendo owner ativo da account.
--
-- Causa: o cliente sobe com `upsert: true`, e o Storage traduz isso para
-- INSERT ... ON CONFLICT (bucket_id, name) DO UPDATE. O PostgreSQL exige policy
-- de SELECT para executar o caminho do ON CONFLICT — ele precisa LER a linha
-- conflitante antes de decidir entre inserir e atualizar. Sem SELECT, a instrução
-- inteira é barrada, e o erro reportado é o de WITH CHECK, que despista.
--
-- A s93 omitiu a SELECT deliberadamente, com o raciocínio de que bucket público é
-- servido pelo endpoint /object/public/ sem passar por RLS. Isso vale para LER OS
-- BYTES, mas não para o lookup de conflito do upsert — que é uma leitura da TABELA
-- storage.objects, e essa passa por RLS.
--
-- Reproduzido em NONPROD antes da correção:
--   INSERT simples                  -> PERMITIDO
--   INSERT ... ON CONFLICT (upsert) -> BLOQUEADO (mensagem idêntica à do bug)
--
-- Esta policy NÃO afrouxa nada: os bytes já eram publicamente legíveis pela URL
-- pública. Ela governa a leitura de METADADOS em storage.objects, e a escopamos ao
-- owner da account — estritamente mais restrita que o acesso público que já existe.

BEGIN;

DROP POLICY IF EXISTS "Account owners can read brand assets" ON storage.objects;
CREATE POLICY "Account owners can read brand assets"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'brand'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_account_owner(((storage.foldername(name))[1])::uuid)
    );

COMMIT;
