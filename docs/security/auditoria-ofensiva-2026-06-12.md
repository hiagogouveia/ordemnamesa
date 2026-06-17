# Auditoria de Segurança Ofensiva — Ordem na Mesa

**Data:** 2026-06-12
**Escopo:** Multi-tenancy, RLS, AuthN/AuthZ, Storage/Upload, APIs, Next.js, CI/CD, OWASP Top 10
**Método:** Análise estática linha-a-linha (94 migrations, 70 route handlers, middleware, storage) + verificação ao vivo no banco de PRODUÇÃO (`buucddacymkybkrszcqy`) via advisors do Supabase e SQL.

> Achados marcados **[CONFIRMADO PROD]** foram validados contra o banco de produção, não apenas no código.

---

## Sumário executivo

A arquitetura de base é sólida: RLS habilitado em 100% das tabelas, helper `is_restaurant_member()` correto, auth server-side via `getUser()` em todas as rotas, webhook Stripe com verificação de assinatura, sem segredos vazados no git. **Porém existem 3 falhas CRÍTICAS de isolamento multi-tenant ativas em produção** e uma classe recorrente de IDOR em rotas que usam service-role sem rechecar membership.

| # | Severidade | Vulnerabilidade |
|---|-----------|-----------------|
| C1 | **Crítico** | RPCs de recebimento (`SECURITY DEFINER`) executáveis por `anon`/`authenticated` com `restaurant_id`/`user_id` forjáveis |
| C2 | **Crítico** | Policy de SELECT no Storage ignora `restaurant_id` → leitura cross-tenant de todas as fotos |
| C3 | **Crítico** | Policy de INSERT no Storage ignora `restaurant_id` → escrita na pasta de qualquer tenant |
| H1 | Alto | IDOR `GET /api/admin/checklists` — leitura cross-tenant |
| H2 | Alto | IDOR `POST /api/task-executions/assume` — escrita cross-tenant |
| H3 | Alto | IDOR `POST /api/task-executions/[id]/assume` — hijack de tarefa |
| H4 | Alto | IDOR `POST /api/checklists/[id]/tasks/[taskId]/block` — escrita/DoS cross-tenant |
| H5 | Alto | Gate de role no middleware via cookie `x-restaurant-role` forjável |
| H6 | Alto | Validação de tipo de upload só no client; bucket sem `allowed_mime_types` |

---

## 1. Multi-tenancy

### C1 — [CRÍTICO] [CONFIRMADO PROD] RPCs de recebimento bypassam RLS e são chamáveis sem autorização
**Arquivos:** `supabase/migrations/20260529_s59_rpc_instantiate_receiving.sql:22-37,131-139`; `20260601_s74_fix_receiving_ambiguous_checklist_id.sql:19-35`

As funções `instantiate_receiving_execution(...)` e `replace_receiving_template_tasks(...)` são `SECURITY DEFINER` (bypassam RLS) e **nunca tiveram `REVOKE EXECUTE ... FROM PUBLIC`**. O advisor de segurança do Supabase confirma em PROD: ambas são executáveis por `anon` E `authenticated` via `/rest/v1/rpc/...`. Os parâmetros `p_restaurant_id`, `p_user_id`, `p_user_name` vêm 100% do corpo da requisição e nunca são comparados com `auth.uid()`. O próprio cabeçalho da migration admite: *"Auth/permissão NÃO é checada nas funções... As RPCs assumem que o caller já é confiável (service-role)"* — mas o grant para service-role nunca foi restringido.

**Exploração** (qualquer usuário logado, sem service role):
```
POST /rest/v1/rpc/instantiate_receiving_execution
{ "p_restaurant_id":"<UUID_VÍTIMA>", "p_template_id":"<template>",
  "p_user_id":"<uuid_de_qualquer_colega>", "p_user_name":"Fulano",
  "p_idempotency_key":"<uuid_aleatório>" }
```
**Impacto:** (a) bypass de autorização — staff/não-membro cria `checklists`+`checklist_tasks`+`checklist_assumptions` que a RLS proíbe; (b) **falsificação de autoria** — execução atribuída a outro funcionário (quebra a auditoria); (c) **escrita cross-tenant** — se o atacante descobrir um `restaurant_id` + UUID de template da vítima (vazados por qualquer URL/resposta de API, ex.: H1), escreve no tenant alheio. `replace_receiving_template_tasks` ainda permite `DELETE`+reescrita das tarefas de template da vítima.

**Correção:**
```sql
-- primeira linha do corpo de cada função:
IF NOT public.is_restaurant_member(p_restaurant_id) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
-- e ao fim da migration:
REVOKE EXECUTE ON FUNCTION public.instantiate_receiving_execution(uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.instantiate_receiving_execution(uuid,uuid,uuid,uuid,text,uuid) TO service_role;
```
Eliminar o parâmetro `p_user_id` e usar `auth.uid()` para que o autor não possa ser forjado. Mesmo tratamento para `replace_receiving_template_tasks` e (Médio) `apply_kit`/`undo_kit_application`.

### Verificado correto
- Tenancy deriva da tabela `restaurant_users`, **não** de claims do JWT (`auth.jwt()`/`app_metadata`) — não forjável.
- `is_restaurant_member(rid, roles[])` checa `user_id = auth.uid() AND active = true AND role = ANY(...)`, é `STABLE SECURITY DEFINER` com `search_path` fixado.
- `restaurant_users`: manager só insere/edita `staff` (`WITH CHECK (role = 'staff')`); só owner muda roles/deleta. **Staff não consegue se auto-promover via RLS.**
- Modo "Visão Global" valida `restaurantIds` server-side via `account_users` (`lib/api/global-scope.ts`), nunca confia em IDs do cliente.

---

## 2. Row Level Security

**Estado em PROD:** RLS habilitado nas 38 tabelas de `public`. As 5 com 0 policies (`admin_logs`, `leads`, `migration_logs`, `ordemnamesa_staff`, `stripe_events`) são acessíveis só por service-role — intencional.

### M8 — [Médio] `task_executions` é deletável pelo próprio autor (quebra de imutabilidade da auditoria)
`supabase/migrations/20260506_s40_rls_standardization.sql:101-106`
```sql
CREATE POLICY "task_executions: membro deleta propria"
ON public.task_executions FOR DELETE TO authenticated
USING ( user_id = auth.uid() AND public.is_restaurant_member(restaurant_id) );
```
Um staff pode dar **hard-delete** nas próprias execuções (inclusive `done`/`flagged`), apagando evidência de tarefa sinalizada/incompleta. Contraste com `task_issue_events`, que é corretamente append-only. **Correção:** bloquear DELETE (toggle vira UPDATE de status) ou restringir a linhas do mesmo dia/incompletas; idealmente soft-delete.

### M9 — [Médio] SELECT de `checklist_assumptions` sem filtro `active = true`
`supabase/migrations/20260313_s8_activity_improvements.sql:25-29` — o fix do s39 adicionou `active = true` ao INSERT mas deixou o SELECT antigo. Um funcionário demitido (`active = false`, linha ainda existe) continua lendo todo o histórico de execução do restaurante. **Correção:** trocar por `USING (public.is_restaurant_member(restaurant_id))`.

### L2 — [Baixo] `notifications` UPDATE permite reescrever qualquer coluna da própria notificação (não só `read`).

---

## 3. Controle de Permissões

### H5 — [Alto] Gate de role baseado em cookie escrito pelo cliente
`middleware.ts:109-122` autoriza rotas admin (`/dashboard /equipe /checklists /configuracoes /relatorios /admin`) pelo cookie `x-restaurant-role`, setado por JS via `document.cookie` em `app/(app)/selecionar-restaurante/page.tsx:36` e `components/layout/sidebar.tsx` — **sem httpOnly, sem Secure**.

**Exploração:** staff abre o DevTools → `document.cookie="x-restaurant-role=owner; path=/"` (ou apenas deleta o cookie — o middleware só bloqueia o valor literal `'staff'`) → todas as telas de gestão renderizam.

**Impacto:** escalada vertical na UI admin. O dado em si é protegido na maioria das APIs (que rechecam `restaurant_users`), então o risco real depende de cada Server Component rechecar a role no servidor. O middleware é **cosmético**, não fronteira de segurança.

**Correção:** resolver a role server-side a partir de `restaurant_users` usando o `user.id` validado; tratar o cookie estritamente como UX; setá-lo via route handler com `httpOnly+Secure` se mantido.

### M5 — [Médio] Owner reseta senha de co-owner (takeover intra-tenant)
`app/api/equipe/change-password/route.ts:44-83` — caller deve ser owner (ok), mas não há proteção owner-sobre-owner: um owner reseta a senha de um co-owner e o desloga globalmente. **Correção:** bloquear quando `target.role === 'owner'` e não for o próprio caller.

### M7 — [Médio] Promoção a owner ignora limites de plano
`app/api/equipe/[id]/route.ts:99-114` — o guard de billing só roda para `manager`/`staff`; promover a `owner` (ou reativar `active:true` sem trocar role) pula o check. Owners ilimitados / reativação sem consumir cota.

### Verificado correto
`equipe` impede manager de gerenciar não-staff, impede rebaixar o último owner e impede trocar a própria role. Control-hub-admin aplica `requireSuperAdmin()`/`requireStaff()` **dentro** de cada Server Action.

---

## 4. Histórico Auditável — *O histórico NÃO é imutável hoje*

Resposta direta à pergunta da auditoria: **não, o histórico pode ser falsificado e apagado.** Vetores:
1. **Falsificação de autor** (C1): `p_user_id`/`p_user_name` forjáveis nas RPCs `SECURITY DEFINER` → execução/assumption atribuída a qualquer pessoa.
2. **Exclusão de evidência** (M8): autor deleta as próprias `task_executions`.
3. **Edição posterior** (L2 e UPDATE policies amplas) em algumas tabelas.

**Como tornar imutável:**
- Derivar o autor sempre de `auth.uid()` no servidor/RPC — nunca de parâmetro.
- Tornar tabelas de execução **append-only**: `REVOKE UPDATE, DELETE` para `authenticated`; correções viram novos eventos (padrão já usado em `task_issue_events`).
- Trigger `BEFORE UPDATE/DELETE ... RAISE EXCEPTION` nas tabelas de auditoria, ou colunas imutáveis via trigger.
- Carimbar `created_at` com `now()` no servidor (default da coluna), nunca aceitar timestamp do cliente.
- Considerar log de auditoria hash-encadeado para evidência forte.

---

## 5 & 6. Upload de Fotos e Supabase Storage — [CONFIRMADO PROD]

**Estado real do bucket `photos` em PROD:** `public=false`, `file_size_limit=NULL` (sem limite), `allowed_mime_types=NULL` (qualquer MIME). Policies em `storage.objects`: INSERT `with_check=(bucket_id='photos')`, SELECT `using=(bucket_id='photos')`.

### C2 — [CRÍTICO] Leitura cross-tenant de fotos
`supabase/migrations/20260528_s55_storage_photos_bucket.sql:13-16` — a policy de SELECT só checa `bucket_id`, ignorando o prefixo `restaurant_id` do path (`${restaurantId}/${executionId}/${file}`). Qualquer colaborador autenticado gera signed URL para foto de **qualquer** restaurante. As signed URLs (1h) não protegem nada — o atacante as emite legitimamente.

### C3 — [CRÍTICO] Escrita cross-tenant de fotos
Mesma migration `:8-11` — INSERT também só checa `bucket_id`. Além disso `restaurantId` vem do cliente (`lib/supabase/storage.ts:50-53`). Qualquer usuário faz upload em `outroTenant/...`. (`upsert:false` impede sobrescrita, não criação de arquivos novos.)

**Correção C2/C3** (nova migration corrigindo a s55):
```sql
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] IN (
    SELECT restaurant_id::text FROM public.restaurant_users
    WHERE user_id = auth.uid() AND active = true
  )
)
-- idem no WITH CHECK do INSERT
```

### H6 — [Alto] Validação de tipo só no client
`storage.ts:57-60` valida `file.type` em JS no browser, mas o bucket tem `allowed_mime_types=NULL`. Atacante chama `supabase.storage.from('photos').upload(path, blob, {contentType:'text/html'})` direto com o JWT → aceita HTML/SVG/JS/executável. **Correção:**
```sql
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png'], file_size_limit = 10485760
WHERE id = 'photos';
```

### M2 — [Médio] SVG/HTML armazenado → XSS via signed URL inline
Consequência de H6. Mitigado parcialmente (previews via `<img>` não executam SVG; servido em `*.supabase.co`, origem separada). Fechado ao aplicar `allowed_mime_types`.

### M3 — [Médio] Sem limite de tamanho no servidor (`file_size_limit=NULL`) → DoS/custo de armazenamento. Fechado no mesmo UPDATE de H6.

### L4 — [Baixo] Extensão derivada de `file.name` sem whitelist (`storage.ts:66-69`) — risco residual de traversal via extensão com `/`. Derivar do MIME validado: `{'image/jpeg':'jpg','image/png':'png'}[file.type]`.

---

## 7. APIs e Server Actions — IDOR recorrente

Raiz comum: a rota valida o token mas **pula a checagem de `restaurant_users`** antes de operar com service-role (que bypassa RLS); `restaurant_id` vem do request e nunca é confrontado com a membership.

| Achado | Rota | Tipo |
|--------|------|------|
| **H1** | `GET /api/admin/checklists` (`route.ts:28-54`) | Leitura cross-tenant (checklists, tasks, assumptions com PII) |
| **H2** | `POST /api/task-executions/assume` (`route.ts:14-65`) | Escrita cross-tenant |
| **H3** | `POST /api/task-executions/[id]/assume` (`route.ts:21-115`) | Hijack/reatribuição de tarefa (BOLA) |
| **H4** | `POST /api/checklists/[id]/tasks/[taskId]/block` (`route.ts:35-134`) | Bloqueio de tarefa cross-tenant (DoS operacional) |

**Exploração (H1):** `curl '.../api/admin/checklists?restaurant_id=<VÍTIMA>' -H "Authorization: Bearer <qualquer_token_válido>"`. Também vaza os UUIDs para encadear H4 e C1.

**Correção (todas):** inserir, após `getUser`, o guard de membership que já é padrão em `dashboard/route.ts:135-145` e `relatorios`. **Recomendação estrutural:** criar helper único `requireMembership(restaurant_id, token, minRole)` e aplicá-lo a toda rota que use service-role, eliminando a classe de regressão. Auditar também `tasks/kanban`, `execucoes/[id]`, `checklist-kits/*`.

### Outros
- **M4** `GET /api/billing/discount:54` — sem guard owner-only; manager lê cupom ativo.
- **M6** `user-roles`/`user-shifts`/`user-areas` POST — `role_id`/`shift_id`/`area_id`/`user_id` não validados contra `restaurant_id`; o `.select()` do insert devolve dados da row estrangeira (leitura cross-tenant via UUID guessing).
- **L** `receiving-templates` POST/PATCH — FKs não validadas cross-tenant.

### Verificado correto
Stripe webhook (assinatura via `constructEvent` + idempotência), checkout/change-plan/portal (resolvem `account_id` server-side, exigem owner), signup (sem mass-assignment, role hardcoded `'owner'`), rotas `[id]` escopam por `id+restaurant_id` (id alheio casa zero rows) com allowlist de campos.

---

## 8. Next.js / Configuração

### M10 — [Médio] Ausência total de headers de segurança
`next.config.ts` não define `headers()`: sem CSP, `X-Frame-Options`, `HSTS`, `Referrer-Policy`, `X-Content-Type-Options`. App autenticado embutível em iframe → **clickjacking**; sem HSTS → SSL-strip. **Correção:** adicionar `async headers()` com `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### M11 — [Médio] Build ignora erros de TS e ESLint
`next.config.ts:5-10`: `eslint.ignoreDuringBuilds:true` + `typescript.ignoreBuildErrors:true`. Deploys de prod não falham com erros de tipo/lint. **Correção:** remover, ou adicionar job CI bloqueante de `tsc --noEmit`+`lint` em todo PR que toque `app/`/`lib/`/`components/`.

### M14 / L — Cookies de contexto (`x-restaurant-*`, `x-account-*`) sem `httpOnly`/`Secure` (escritos via `document.cookie`). Amplificador de XSS; nunca usar para autorização.

### L — `components/seo/JsonLd.tsx:9` usa `dangerouslySetInnerHTML` com `JSON.stringify` (não escapa `<`/`>`). Hoje só recebe dados estáticos — seguro, mas frágil se passar dado de usuário. Escapar `<`,`>`,`&` no output.

---

## 9. Autenticação

- `middleware.ts:32` usa `getUser()` (valida JWT server-side) — correto, sem `getSession()`.
- Logout chama `supabase.auth.signOut()` e limpa cookies de contexto — correto.
- **L** `app/api/auth/signout/route.ts:11` instancia o SSR client com `SUPABASE_SERVICE_ROLE_KEY` em vez da ANON — anti-pattern (não vaza, server-side).
- **WARN (advisor)** Proteção contra senha vazada (HaveIBeenPwned) **desabilitada** no Supabase Auth — habilitar.
- **M13** Sem rate limit em `app/(auth)/forgot-password/actions.ts` (email bombing) e no lead intake público `app/qualificacao/actions.ts` (sem CAPTCHA/throttle/limite de tamanho → DB bloat). Signup tem rate limit, mas **in-memory por processo** (não compartilhado no Docker multi-instância) e baseado em `x-forwarded-for` spoofável.

---

## 10. Banco de Dados

- **WARN (advisor)** 5 funções com `search_path` mutável: `apply_kit`, `undo_kit_application`, `touch_task_issues_updated_at`, `tg_receiving_templates_updated_at`, `tg_checklist_templates_updated_at`, `tg_template_kits_updated_at`. Adicionar `SET search_path = public, pg_temp`.
- `SECURITY DEFINER` perigosos: C1 (crítico) + H1-kit. `is_restaurant_member`/`replicate_checklists`/`signup_create_restaurant` são DEFINER mas com autorização interna adequada (advisor sinaliza `signup_create_restaurant` chamável por `anon` — é por design do fluxo de signup, validar se o rate-limit cobre).
- Sem SQL injection direto observado (uso de query builder do Supabase).

---

## 11. Infraestrutura / CI/CD

### M12 — [Médio] `security-tests.yml` expõe service-role NONPROD em `pull_request`
`.github/workflows/security-tests.yml:3-10,42-58` dispara em `pull_request`, materializa `NONPROD_SUPABASE_SERVICE_ROLE_KEY` num `.env.nonprod` e roda `npm ci`+testes com o código do PR. Para PRs de **branches internas** (não-fork), os secrets são injetados → `npm ci` (lifecycle scripts) ou um teste malicioso pode exfiltrar a chave. **Atenuante:** é `pull_request` (não `pull_request_target`); forks em repo público não recebem secrets. **Correção:** mover o passo que usa service-role para o trigger `push` em `develop`, ou exigir `environment` com required reviewers.

### Verificado correto
Nenhum segredo vazado no git (`.gitignore` cobre `.env*`/`.mcp.json`/`*.pem`; `.env.example` vazio; sem chaves hardcoded). `SERVICE_ROLE_KEY` só em `app/api/**` server-side. Deploy workflows com `permissions` mínimo e whitelist de chaves no `.env` da VPS. `security-advisors.yml` só roda em `push`-gated. `images.remotePatterns` restrito a `*.supabase.co/storage/...`.

### L — Scripts de dev versionados na raiz (`create-test-user.js`, `query_areas.js`, `test-*.js`) usam service-role via env — mover para pasta ignorada/remover.

---

## 12 & 13. Frontend / Operacional

- **Clickjacking** (M10): sem `X-Frame-Options`/`frame-ancestors`.
- **XSS:** sem uso inseguro de `dangerouslySetInnerHTML` com dado de usuário hoje (só JsonLd estático — L).
- **Open redirect:** não vulnerável — middleware só redireciona para paths internos fixos, sem `?next=`/`?redirect=`.
- **Rate limiting:** ausente em endpoints públicos (M13). Sem proteção sistêmica contra brute force/enumeração além do signup in-memory.

---

## 14. Mapeamento OWASP Top 10 (2021)

| OWASP | Achados | Risco | Prioridade |
|-------|---------|-------|-----------|
| **A01 Broken Access Control** | C1, C2, C3, H1-H5, M4-M9 | **Crítico** | Imediata |
| **A02 Cryptographic Failures** | M14 (cookies sem Secure), senha vazada off | Médio | 7 dias |
| **A03 Injection** | L (JsonLd latente); sem SQLi direto | Baixo | 30 dias |
| **A04 Insecure Design** | C1 (RPC confia no client), histórico mutável (M8), sem rate limit (M13) | Alto | 7 dias |
| **A05 Security Misconfiguration** | C2/C3/H6 (bucket), M10 (headers), M11 (build ignore), M12 (CI) | **Crítico** | Imediata/7 dias |
| **A06 Vulnerable Components** | Não avaliado a fundo (rodar `npm audit`) | — | 30 dias |
| **A07 AuthN Failures** | H5 (cookie role), M13 (rate limit), senha vazada off | Alto | 7 dias |
| **A08 Software/Data Integrity** | M8 (auditoria deletável), C1 (autor forjável) | Alto | 7 dias |
| **A09 Logging/Monitoring** | Erros internos em 500s; sem alertas de anomalia | Médio | 30 dias |
| **A10 SSRF** | Não observado | Baixo | — |

---

## Tabela de Avaliação Final

| Severidade | Vulnerabilidade | Impacto | Probabilidade | Prioridade |
|-----------|-----------------|---------|---------------|-----------|
| **Crítico** | C1 RPC recebimento sem authz (anon/auth, autor forjável) | Bypass RLS, escrita cross-tenant, falsificação de auditoria | Alta (exposto em PROD) | P0 |
| **Crítico** | C2 SELECT Storage cross-tenant | Vazamento de todas as fotos de todos os tenants | Alta | P0 |
| **Crítico** | C3 INSERT Storage cross-tenant | Escrita/poluição na pasta de qualquer tenant | Alta | P0 |
| **Alto** | H1 IDOR GET admin/checklists | Leitura cross-tenant + PII | Alta | P0 |
| **Alto** | H2 IDOR assume | Escrita cross-tenant | Média | P1 |
| **Alto** | H3 IDOR [id]/assume | Hijack de tarefa | Média | P1 |
| **Alto** | H4 IDOR block | DoS operacional cross-tenant | Média | P1 |
| **Alto** | H5 Role via cookie forjável | Escalada vertical na UI admin | Alta | P1 |
| **Alto** | H6 Upload sem validação server | Upload arbitrário (HTML/SVG/JS) | Alta | P1 |
| **Médio** | M1 apply_kit/undo PUBLIC (autor forjável) | Forja de autor (RLS gateia writes) | Média | P2 |
| **Médio** | M2 SVG/HTML XSS stored | XSS via link direto | Baixa | P2 |
| **Médio** | M3 Sem limite de tamanho | DoS/custo | Média | P2 |
| **Médio** | M4 billing/discount sem owner-check | Vazamento de cupom intra-tenant | Baixa | P2 |
| **Médio** | M5 reset senha owner-on-owner | Takeover intra-tenant | Baixa | P2 |
| **Médio** | M6 FKs cross-tenant não validadas | Leitura/poluição cross-tenant | Média | P2 |
| **Médio** | M7 promoção a owner ignora plano | Abuso de cota | Baixa | P2 |
| **Médio** | M8 task_executions deletável | Apagar evidência (auditoria) | Média | P1 |
| **Médio** | M9 assumptions SELECT sem active | Ex-funcionário lê histórico | Média | P2 |
| **Médio** | M10 sem headers segurança | Clickjacking, SSL-strip | Média | P1 |
| **Médio** | M11 build ignora TS/lint | Bugs passam ao deploy | Alta | P2 |
| **Médio** | M12 CI expõe service-role em PR | Exfiltração de chave NONPROD | Baixa | P2 |
| **Médio** | M13 sem rate limit público | Email bombing, DB bloat | Média | P2 |
| **Médio** | M14 cookies sem httpOnly/Secure | Amplificador XSS | Média | P2 |
| **Baixo** | L1-Lx (notifications, signout key, JsonLd, scripts dev, search_path, senha vazada, traversal extensão, erros em 500) | Variado | — | P3 |

---

## Plano de Correção

### Correções imediatas (24 h) — P0, isolamento multi-tenant quebrado em PROD
1. **C1:** nova migration que adiciona `IF NOT is_restaurant_member(p_restaurant_id) THEN RAISE` no corpo das RPCs de recebimento + `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role`. Remover `p_user_id` (usar `auth.uid()`).
2. **C2/C3:** nova migration reescrevendo as policies INSERT/SELECT de `storage.objects` amarrando `(storage.foldername(name))[1]` ao `restaurant_users` do `auth.uid()`.
3. **H1:** adicionar guard de membership em `GET /api/admin/checklists` (vazamento de leitura + cadeia de ataque).
4. `UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png'], file_size_limit=10485760 WHERE id='photos'` (H6/M2/M3 num comando).

### Correções prioritárias (7 dias) — P1
5. Criar helper `requireMembership(restaurant_id, token, minRole)` e aplicar em H2, H3, H4 e nas demais rotas service-role.
6. **H5:** resolver role server-side; tratar `x-restaurant-role` como UX; cookies via route handler `httpOnly+Secure`.
7. **M8:** tornar `task_executions` append-only (revogar DELETE/UPDATE; toggle vira status). Implementar imutabilidade de auditoria (seção 4).
8. **M10:** headers de segurança em `next.config.ts`.
9. Habilitar proteção de senha vazada no Supabase Auth.

### Correções importantes (30 dias) — P2
10. M1 (revoke kits), M4 (owner-check discount), M5 (owner-on-owner), M6 (validar FKs), M7 (plano na promoção), M9 (active no SELECT), M12 (CI), M13 (rate limit distribuído — Redis/Upstash), M14 (cookies).
11. Remover `ignoreBuildErrors`/`ignoreDuringBuilds` (M11) ou adicionar CI gate bloqueante.
12. Fixar `search_path` nas 5 funções; rodar `npm audit` (A06).

### Melhorias futuras
13. Log de auditoria hash-encadeado para evidência forte.
14. WAF/rate limiting na borda (Vercel/Cloudflare).
15. Testes de segurança automatizados cobrindo cross-tenant (estender `tests/security/`).
16. CSP estrita; remover scripts de dev do versionamento; padronizar respostas de erro (não vazar `.message`).

---

*Itens [CONFIRMADO PROD]: C1 (advisor `anon`/`authenticated` executable), C2/C3/H6/M3 (estado do bucket), RLS habilitado nas 38 tabelas, 5 funções `search_path` mutável, senha vazada desabilitada.*
