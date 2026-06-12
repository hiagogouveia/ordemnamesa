# Guia de RLS Multi-tenant — Ordem na Mesa

Este documento é **fonte de verdade** para qualquer migration que toque em RLS, policies ou funções `SECURITY DEFINER` no projeto. Antes de abrir um PR que crie/altere tabelas, leia o checklist no fim do documento.

## 1. Modelo

O sistema é multi-tenant onde o tenant é o **restaurante**. Toda tabela operacional tem `restaurant_id uuid`. O isolamento é feito por RLS, não por filtros aplicacionais — o app pode falhar em filtrar e o banco continua bloqueando.

Membership: `public.restaurant_users` (`user_id`, `restaurant_id`, `role`, `active`). Roles: `owner`, `manager`, `staff`.

## 2. Helper oficial

Toda nova policy multi-tenant **deve** usar:

```sql
public.is_restaurant_member(rid uuid, required_roles text[] DEFAULT NULL) RETURNS boolean
```

- `required_roles = NULL` → qualquer role (membro ativo).
- `required_roles = ARRAY['owner','manager']` → restringe.
- A função é `SECURITY DEFINER` com `search_path = public, pg_temp`.
- Já filtra `active = true` internamente.
- `EXECUTE` foi revogado de `PUBLIC`/`anon`; só `authenticated` chama.

**Não escreva `EXISTS (SELECT 1 FROM restaurant_users …)` inline.** O risco do typo `ru.restaurant_id = ru.restaurant_id` (vazamento cross-tenant) já aconteceu uma vez no projeto e foi corrigido na fase 3 — usar o helper elimina a categoria inteira de bug.

## 3. Como criar uma tabela multi-tenant

```sql
CREATE TABLE public.minha_tabela (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- … colunas de domínio …
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro ativo do restaurante
CREATE POLICY "minha_tabela_select"
  ON public.minha_tabela FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

-- INSERT/UPDATE: owner ou manager
CREATE POLICY "minha_tabela_insert"
  ON public.minha_tabela FOR INSERT TO authenticated
  WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

CREATE POLICY "minha_tabela_update"
  ON public.minha_tabela FOR UPDATE TO authenticated
  USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- DELETE: só owner
CREATE POLICY "minha_tabela_delete"
  ON public.minha_tabela FOR DELETE TO authenticated
  USING (public.is_restaurant_member(restaurant_id, ARRAY['owner']));
```

## 4. Tabelas com `user_id` próprio

Para tabelas onde cada linha pertence a um usuário específico (`task_executions`, `checklist_assumptions`):

- INSERT/UPDATE devem **travar** `user_id = auth.uid()` exceto quando owner/manager precisar editar em nome do staff:

```sql
WITH CHECK (
  (user_id = auth.uid() AND public.is_restaurant_member(restaurant_id))
  OR public.is_restaurant_member(restaurant_id, ARRAY['owner','manager'])
)
```

- Sem essa trava, qualquer staff pode atribuir registros para colegas dentro do mesmo tenant.

## 5. Funções `SECURITY DEFINER`

Regras obrigatórias:

1. **Sempre** `SET search_path = public, pg_temp` (evita schema hijack).
2. Após criar, **revogar** `EXECUTE` de `PUBLIC`/`anon` se a função não for para o público anônimo:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.minha_fn(...) FROM PUBLIC, anon;
   GRANT  EXECUTE ON FUNCTION public.minha_fn(...) TO authenticated;
   ```
3. Validar membership dentro da função (não confiar que o caller já filtrou).
4. Documentar o que a função assume sobre `auth.uid()`.

Ver [supabase/migrations/20260505_s38_rls_hardening.sql](../../supabase/migrations/20260505_s38_rls_hardening.sql) para padrão de hardening retroativo.

## 6. Roles na clause `TO`

- Use **`TO authenticated`** em policies de fluxo logado.
- Não use `TO public` (inclui `anon`). Funcionalmente é OK porque `auth.uid()` retorna NULL para anon e a policy falha, mas a convenção segura é explícita.
- Tabelas service-role-only (admin_logs, leads, ordemnamesa_staff, migration_logs) ficam **com RLS habilitado e zero policies** — service role bypassa.

## 7. Exemplos incorretos

```sql
-- ❌ ERRADO: bug que já causou vazamento cross-tenant em produção
USING (EXISTS (SELECT 1 FROM restaurant_users ru
               WHERE ru.restaurant_id = ru.restaurant_id  -- sempre true!
                 AND ru.user_id = auth.uid()))

-- ❌ ERRADO: WITH CHECK true em INSERT/UPDATE
CREATE POLICY foo ON public.t FOR INSERT WITH CHECK (true);

-- ❌ ERRADO: SECURITY DEFINER sem search_path fixo
CREATE FUNCTION public.fn() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN ... END $$;

-- ❌ ERRADO: nova tabela em public sem RLS
CREATE TABLE public.foo (...);  -- esqueceu ENABLE ROW LEVEL SECURITY
```

## 8. Como validar localmente

### 8.1 Advisors do Supabase

Após qualquer migration que toque em RLS:

```bash
# via MCP
mcp__supabase__get_advisors(project_id, type='security')
```

Trate **ERROR** como bloqueante para merge. WARNs devem ter justificativa documentada (ex.: `signup_create_restaurant` callable por anon é decisão de produto).

### 8.2 Teste de isolamento multi-tenant

Em SQL direto (psql ou MCP), simule autenticação:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"<UUID-DO-USER-A>","role":"authenticated"}';

-- Tente acessar dados do restaurante B (do qual o user A NÃO é membro):
SELECT count(*) FROM public.minha_tabela WHERE restaurant_id = '<UUID-RESTAURANTE-B>';
-- Esperado: 0
```

Repita para cada tabela nova com `restaurant_id`.

### 8.3 Confirmar que `WITH CHECK` bloqueia INSERT cross-tenant

```sql
DO $$ BEGIN
  PERFORM set_config('role','authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"<USER-A>"}', true);
  BEGIN
    INSERT INTO public.minha_tabela (restaurant_id, …)
    VALUES ('<RESTAURANTE-B>', …);
    RAISE EXCEPTION 'TEST FAILED — RLS deixou passar';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK — RLS bloqueou: %', SQLERRM;
  END;
END $$;
```

## 9. Event trigger anti-RLS (estado atual)

Existe em [supabase/migrations/20260505_s40_rls_standardization.sql](../../supabase/migrations/20260505_s40_rls_standardization.sql) **comentado**, em duas variantes (warn-only e enforcement). **Ainda não está ativo** — ativação requer:

1. Rodar warn-only em NONPROD por 2–4 semanas e coletar falsos positivos.
2. Construir allowlist (extensions, partições, tabelas internas Supabase).
3. Em mesma transação, mover `ENABLE ROW LEVEL SECURITY` para o **mesmo statement** quando possível, ou usar funções helper que combinam.

Enquanto não está ativo, a defesa é o **checklist de revisão** abaixo.

## 10. Checklist obrigatório para PRs / migrations

Cole no template de PR e marque cada item:

- [ ] Toda nova tabela em `public` tem `ALTER TABLE … ENABLE ROW LEVEL SECURITY` na mesma migration
- [ ] Toda tabela operacional tem `restaurant_id uuid NOT NULL REFERENCES public.restaurants(id)`
- [ ] Policies usam `public.is_restaurant_member(restaurant_id [, roles])` — não `EXISTS` inline
- [ ] Policies declaradas `TO authenticated`
- [ ] Para tabelas com `user_id`: INSERT/UPDATE travam `user_id = auth.uid()` (override só para owner/manager se necessário)
- [ ] Funções novas `SECURITY DEFINER` declaram `SET search_path = public, pg_temp`
- [ ] Para essas funções, `EXECUTE` foi revogado de `PUBLIC`/`anon` (a menos que callable por anon seja intencional)
- [ ] `mcp__supabase__get_advisors(type='security')` rodado em NONPROD: zero ERROR; WARNs novos justificados no PR
- [ ] Smoke test multi-tenant rodado: user de A **não** vê dados de B em nenhuma das tabelas tocadas
- [ ] Se a migration mexe em policies existentes, comportamento preservado (mesmo nome de policy quando possível para não quebrar testes/auditoria)

## 11. `replicate_checklists` — modelo de segurança

Função `SECURITY DEFINER` em `public.replicate_checklists(p_checklist_ids uuid[], p_target_restaurant_ids uuid[])` é a única superfície que **escreve dados em múltiplos restaurantes simultaneamente**. Modelo:

1. Rejeita `auth.uid() IS NULL` (anônimo) com `42501`.
2. Resolve as restaurantes-origem a partir dos `checklist_ids` informados (não confia que o caller já filtrou).
3. Calcula `v_all_rids = src ∪ targets` e exige que **todos** pertençam à mesma `account_id` (1 linha distinct). Caso contrário falha com `42501`. Isso bloqueia replicação cross-account mesmo que o atacante seja owner de duas accounts diferentes.
4. Autoriza por **um** dos dois caminhos:
   - `account_users.role IN ('owner','manager') AND active` na account em comum (modo account-level), **ou**
   - `is_restaurant_member(rid, ARRAY['owner','manager'])` para **cada** `rid ∈ v_all_rids` (modo restaurant-level).
5. Para cada destino, toma `pg_advisory_xact_lock` para impedir replicações concorrentes duplicadas.
6. Idempotência: pula INSERT se já existe checklist com mesmo `root_source_checklist_id` no destino.
7. INSERT reseta campos sensíveis: `role_id = NULL`, `assigned_to_user_id = NULL`, `created_by = auth.uid()`. Não copia atribuições do tenant origem.
8. Não usa SQL dinâmico. Falhas individuais retornam linha `status='error'` sem abortar lote.

A API REST `/api/checklists/replicate` ([app/api/checklists/replicate/route.ts](../../app/api/checklists/replicate/route.ts)) valida regex de UUID antes de chamar a RPC, mas **não pode** ser tratada como única defesa: o RPC é callable diretamente via PostgREST por qualquer `authenticated`. Toda a defesa real está dentro da função.

Quando alterar a função:
- Mantenha `SECURITY DEFINER` + `SET search_path = public, pg_temp`.
- Mantenha `EXECUTE` revogado de `PUBLIC`/`anon` e concedido apenas a `authenticated`.
- Re-rode os smoke tests: owner de A → restaurante de B (deve falhar com `42501`).

## 12. Governança no CI

[.github/workflows/security-advisors.yml](../../.github/workflows/security-advisors.yml) roda em PR e em `push develop`:

**Job 1 — `migration-lint`** (sempre executa):
- Falha se nova `CREATE TABLE` em `public` não tiver `ALTER TABLE … ENABLE ROW LEVEL SECURITY` na mesma migration.
- Falha em `WITH CHECK (true)`.
- Falha no padrão histórico `ru.restaurant_id = ru.restaurant_id`.
- Falha em `SECURITY DEFINER` sem `SET search_path = public[, pg_temp]`.

**Job 2 — `supabase-advisors`** (apenas em `push develop`):
- Chama Supabase Management API: `GET /v1/projects/{ref}/advisors/security`.
- Falha **apenas em `ERROR`**. WARN/INFO são tolerados (adoção gradual).
- Requer secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_NONPROD_PROJECT_REF` no repositório.

Como configurar:
1. Em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens), crie um Personal Access Token.
2. Em **Settings → Secrets and variables → Actions** do repo, adicione:
   - `SUPABASE_ACCESS_TOKEN = <PAT>`
   - `SUPABASE_NONPROD_PROJECT_REF = mkwxulikizrfdupqpyrn`
3. Sem esses secrets, o job emite WARN e passa (não bloqueia merge) — útil enquanto o time não está pronto.

## 13. Fluxo de auditoria periódica

Sugerido mensal:

```bash
# Listar todas as policies do public e procurar padrões inseguros conhecidos
psql "$DB_URL" -c "
  SELECT tablename, policyname, cmd, roles::text,
         qual ILIKE '%ru.restaurant_id = ru.restaurant_id%'
            OR with_check ILIKE '%ru.restaurant_id = ru.restaurant_id%' AS has_old_bug,
         qual ILIKE '%is_restaurant_member%'
            OR with_check ILIKE '%is_restaurant_member%' AS uses_helper
  FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
"
```

Ações de follow-up:
- `has_old_bug = true` em qualquer linha: tratar como ERROR — abrir incident.
- `uses_helper = false` para tabela operacional: backlog de migração.
- Tabela em `pg_tables` com `rowsecurity = false` em `public`: ERROR — habilitar RLS imediatamente.

## 14. Troubleshooting comum

| Sintoma | Causa provável | Verificação |
|---|---|---|
| `permission denied for function is_restaurant_member` | role `anon` tentando chamar | Confirmar `EXECUTE` para `authenticated`; usuário precisa estar logado |
| Policy bloqueia `service_role` | Não bloqueia — service_role bypassa RLS | Verificar se a request realmente está usando service_role key |
| INSERT falha com `new row violates row-level security policy` | `WITH CHECK` rejeita; geralmente `restaurant_id` da linha não bate com `auth.uid()` | Logar `auth.uid()` e `restaurant_id` da linha; conferir membership ativa |
| `replicate_checklists` falha com `42501 Acesso negado a uma ou mais unidades` | caller não é owner/manager de algum restaurante envolvido | Inspecionar `restaurant_users` do caller; conferir `active = true` |
| `replicate_checklists` falha com `42501 Todas as unidades devem pertencer à mesma account` | há restaurantes de accounts diferentes na mesma chamada | Cliente está enviando IDs de tenants distintos; rejeitar antes de chamar |
| Realtime / Postgres Changes não retorna nada para usuário comum | RLS aplica em Realtime também — usuário sem membership não vê | Confirmar que o user está em `restaurant_users` ativo do tenant |

## 15. Histórico

- **s38** (2026-05-05): habilitou RLS em `migration_logs`, removeu `WITH CHECK true` em `notifications`, fixou `search_path` e revogou EXECUTE indevido de funções `SECURITY DEFINER`.
- **s39** (2026-05-05): corrigiu vazamento cross-tenant em `checklists`, `checklist_tasks`, `task_executions` (typo `ru.restaurant_id = ru.restaurant_id`); endureceu `task_executions` UPDATE e `checklist_assumptions` INSERT contra reassignment de `user_id`.
- **s40** (2026-05-05): introduziu helper `is_restaurant_member` e migrou as 3 tabelas críticas para usá-lo. Event trigger anti-RLS entregue comentado.
- **s41** (2026-05-05): auditoria de `replicate_checklists` (sem vulnerabilidade, apenas substituiu EXISTS inline pelo helper) e migração de policies inline para o helper em `areas`, `checklist_orders`, `purchase_items`, `purchase_lists`, `roles`, `shifts`, `user_areas`, `user_roles`, `user_shifts`. CI workflow `security-advisors.yml` introduzido.
