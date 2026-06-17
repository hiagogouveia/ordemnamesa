# Testes de Segurança — Ordem na Mesa

Esta suíte garante que o hardening multi-tenant das fases 1–5 **não regrida**. É composta por:

1. Testes de RLS reais que se autenticam contra o Supabase NONPROD
2. Testes de regressão para os 3 bugs históricos já corrigidos
3. Script de auditoria estática (`scripts/security-audit.ts`)
4. Workflow de CI (`.github/workflows/security-tests.yml`)

> **Nunca** rode esta suíte contra PROD. O carregador de env (`tests/security/helpers/load-env.ts`) e o script de auditoria recusam executar contra `buucddacymkybkrszcqy`.

## 1. Como rodar localmente

```bash
# 1. Garanta .env.nonprod com:
#    NEXT_PUBLIC_SUPABASE_URL=https://mkwxulikizrfdupqpyrn.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#    SUPABASE_SERVICE_ROLE_KEY=...
#    SUPABASE_ACCESS_TOKEN=<PAT>      # apenas para `security:audit`
#    SUPABASE_NONPROD_PROJECT_REF=mkwxulikizrfdupqpyrn   # opcional (derivado da URL)

# 2. Auditoria estática (rápido, ~2s, sem provisionar):
#    Requer SUPABASE_ACCESS_TOKEN (PAT criado em supabase.com/dashboard/account/tokens).
npm run security:audit

# 3. Suíte completa de RLS (~30–60s, provisiona 6 users + 3 restaurantes em NONPROD e remove ao fim):
npm run test:security
```

A suíte cria fixtures namespaced (`rlstest-<runid>-*`) e remove tudo no `afterAll`. Se um run abortar antes do cleanup, a próxima execução não colide — cada run tem seu próprio prefixo. Para limpar resíduos manualmente: `DELETE FROM auth.users WHERE email LIKE 'rlstest-%@example.test';` (cascateia).

## 2. Estrutura

```text
tests/security/
├── helpers/
│   ├── load-env.ts           ← carrega .env.nonprod, recusa PROD
│   ├── supabase.ts           ← createAnonClient, createAuthenticatedClient, createServiceClient
│   ├── assertions.ts         ← expectRlsDenied, expectCrossTenantDenied, expectOk
│   ├── fixtures.ts           ← provisionFixtures + cleanup (6 users, 3 restaurantes, 2 accounts)
│   └── shared-fixtures.ts    ← compartilhamento entre arquivos de teste
├── rls/
│   ├── checklists.test.ts            (6 cases)
│   ├── task-executions.test.ts       (5 cases — incluindo P1 reassignment)
│   ├── notifications.test.ts         (3 cases)
│   └── replicate-checklists.test.ts  (5 cases — incluindo cross-account)
└── regression/
    └── historical-bugs.test.ts       (4 cases — invoca runSecurityAudit)

scripts/security-audit.ts             ← módulo + CLI (npm run security:audit)
.github/workflows/security-tests.yml  ← CI: lint + typecheck + audit + RLS tests
```

## 3. Helpers reutilizáveis

### `createAuthenticatedClient(jwt)`
Cria um `SupabaseClient` que envia `Authorization: Bearer <jwt>` em toda request. Use para simular usuário real autenticado.

### `expectRlsDenied(response)`
Aceita as duas formas que RLS pode bloquear:
- `error.code === '42501'` (insufficient_privilege) em INSERT/UPDATE/DELETE
- `data === []` (linhas vazias silenciosas) em SELECT

### `expectCrossTenantDenied(response)`
Açúcar para o caso `data === []` em SELECTs que deveriam estar bloqueados.

### `expectOk(response)`
Falha o teste se houve erro; retorna `data` tipado. Use no caminho legítimo.

### `provisionFixtures()`
Cria, via service role:
- 2 accounts (`alpha`, `bravo`)
- 3 restaurants: A e B em alpha, C em bravo
- 6 users + memberships:
  - **ownerA** — owner de A; também owner da account alpha
  - **managerA** — manager de A
  - **staffA** — staff ativo de A
  - **inactiveA** — staff inativo de A (`active=false`)
  - **ownerB** — owner de B (sem account_users)
  - **ownerC** — owner de C (account bravo)

Retorna `accessToken` para cada user — JWTs reais via `signInWithPassword`.

## 4. Como criar novos testes de RLS

```ts
import { afterAll, beforeAll, describe, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import { expectCrossTenantDenied, expectOk } from "../helpers/assertions";

describe("RLS · minha_tabela", () => {
    let fx: Awaited<ReturnType<typeof getSharedFixtures>>;

    beforeAll(async () => { fx = await getSharedFixtures(); });
    afterAll(async () => { await teardownSharedFixtures(); });

    it("ownerA não vê linhas do restaurante B", async () => {
        const sb = clientFor(fx.ownerA);
        const r = await sb.from("minha_tabela").select("id")
            .eq("restaurant_id", fx.restaurantB.id);
        expectCrossTenantDenied(r);
    });
});
```

### Boas práticas
- **Nunca** use `createServiceClient()` dentro de uma assertion — bypassa RLS e mascara o bug.
- **Sempre** teste o caminho positivo + ao menos um cross-tenant.
- Para INSERTs com `user_id`, teste explicitamente `user_id = outro_user`.
- Use `fx.runId` para namespacar dados criados pelo teste (ex.: `title: \`for-staffA-${fx.runId}\``).

## 5. Como interpretar falhas

| Falha | Causa provável |
|---|---|
| `Esperado sucesso, mas houve erro: row-level security` | Policy ficou mais restritiva do que o teste esperava — verifique se o helper foi chamado com role correto |
| `RLS deveria ter bloqueado, mas retornou N linha(s)` | Vazamento real — aborte o merge e investigue a policy |
| `provisionFixtures falhou: ...` | Service role key inválida ou schema mudou (FK NOT NULL nova etc.) |
| `Recusando rodar contra PROD` | URL do projeto bate com PROD — confira `TEST_ENV_FILE` |
| Timeouts | Network lento contra Supabase ou ratelimit; aumentar `testTimeout` em `vitest.config.ts` |

## 6. Bugs históricos protegidos

`tests/security/regression/historical-bugs.test.ts` falha se:

| ID | Bug original | Fase corrigida |
|---|---|---|
| `ru-restaurant-id-self-eq` | Policy com `ru.restaurant_id = ru.restaurant_id` (sempre true → vazamento cross-tenant) | s39 |
| `with-check-true` | Policy de INSERT/UPDATE com `WITH CHECK (true)` aberta para `public` | s38 (notifications) |
| `secdef-no-search-path` | `SECURITY DEFINER` sem `SET search_path = public, pg_temp` | s38 |

## 7. Auditoria contínua

`scripts/security-audit.ts` é tanto módulo (importável pelos testes) quanto CLI (`npm run security:audit`). Roda 6 checks contra o catálogo do Postgres:

| ID | Severidade |
|---|:-:|
| `rls-disabled-in-public` | error |
| `with-check-true` | error |
| `ru-restaurant-id-self-eq` | error |
| `secdef-no-search-path` | error |
| `secdef-anon-execute` | warn (allowlist: `signup_create_restaurant`) |
| `policy-inline-exists` | info (oportunidade de migrar para `is_restaurant_member`) |

CLI sai com:
- `0` — zero ERRORs (WARN/INFO toleráveis)
- `1` — pelo menos 1 ERROR
- `2` — falha de runtime (env mal configurada, conexão etc.)

### Limitação conhecida

A leitura do catálogo (`pg_policies`, `pg_proc`) é feita via endpoint `pg-meta` da Supabase. Se o projeto não expõe esse endpoint, os checks que dependem dele caem em modo `warn: 'check-runtime-error'`. Nesse caso, use o workflow `security-advisors.yml` (já existente) que consulta a Management API oficial.

## 8. Configurando o CI

`.github/workflows/security-tests.yml` requer 3 secrets em **Settings → Secrets → Actions**:

- `NONPROD_SUPABASE_URL`
- `NONPROD_SUPABASE_ANON_KEY`
- `NONPROD_SUPABASE_SERVICE_ROLE_KEY`

Sem eles, o job emite `::warning` e passa (não bloqueia merge — adoção gradual). Quando os secrets existem, o pipeline:

1. `npm ci`
2. `npm run lint`
3. `npx tsc --noEmit`
4. Materializa `.env.nonprod` a partir dos secrets
5. `npm run security:audit` (auditoria estática)
6. `npm run test:security` (RLS contra NONPROD real)

Falha bloqueante se:
- ESLint falhar
- Typecheck falhar
- Auditoria retornar ERROR
- Qualquer teste de RLS falhar

## 9. Cobertura atual (24 cases)

| Tabela / RPC | Cases | Cobre |
|---|:-:|---|
| `checklists` | 6 | own SELECT, cross-tenant SELECT/UPDATE, staff sem write, manager write, user inativo |
| `task_executions` | 5 | INSERT próprio, INSERT alheio (P1), cross-tenant INSERT, SELECT staff vs owner |
| `notifications` | 3 | INSERT auth bloqueado, SELECT user-scoped, cross-tenant |
| `replicate_checklists` | 5 | legítimo, cross-account, staff bloqueado, array vazio, sem account-level |
| Regressão | 4 | 3 bugs históricos + sanidade (zero ERROR) |

## 10. Recomendações

- Rodar `npm run test:security` antes de qualquer migration que toque RLS ou policies.
- Adicionar 1 caso novo a cada nova tabela com `restaurant_id`.
- Re-rodar `npm run security:audit` após cada migration aplicada — exit code 0 é parte da definição de pronto.
