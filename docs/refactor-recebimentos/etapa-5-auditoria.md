# Etapa 5 — Auditoria final pré-execução

**Objetivo:** validar zero dependências operacionais do legacy antes de remover schema.
**Veredito antecipado:** sem bloqueador absoluto, mas **a Etapa 5 NÃO é apenas migration** — exige *code cleanup* obrigatório antes do schema drop. Plano único proposto no §7.

---

## 1. Banco de dados — referências restantes

### 1.1 Foreign Keys
**Apontando PARA `receiving_expectations`:** **zero**.
**Saindo DE `receiving_expectations`:** 4 FKs (assumption_id → checklist_assumptions, checklist_id → checklists, confirmed_by → auth.users, restaurant_id → restaurants). Todas com semântica `ON DELETE` apropriada (não bloqueiam DROP da tabela).

### 1.2 Check Constraints
- `notifications.notifications_type_check`: ainda lista `RECEIVING_OVERDUE` e `RECEIVING_PENDING_CONFIRMATION`. Precisa ser **refeito** sem essas opções.

### 1.3 Functions / RPCs
**Zero functions** no schema public referenciam `receiving_expectations`, `receiving_mode`, `receiving_generation`, `supplier_name`, `allow_manual_receiving` ou os tipos de notificação. As 9 funções existentes (`instantiate_receiving_execution`, `replace_receiving_template_tasks`, `is_restaurant_member`, etc.) estão limpas.

### 1.4 Triggers
**Zero triggers** atrelados a `receiving_expectations` (verificado).

### 1.5 Views
**Zero views** no schema public referenciam qualquer entidade legacy.

### 1.6 Policies RLS
**Zero policies** com clauses USING/WITH CHECK que mencionem receiving_* ou allow_manual_*. As 3 policies em `receiving_expectations` (que serão dropadas com a tabela) são as únicas refs e morrem juntas.

### 1.7 Índices
4 indexes em `receiving_expectations` (PK, unique composto, 2 secundários) — caem automaticamente no DROP TABLE.
**Zero** indexes em colunas legacy de `checklists` ou `areas`.

---

## 2. Estado dos dados (nonprod)

| Tabela | Linhas | Detalhe |
|---|---|---|
| `receiving_expectations` | **17** | 1 restaurante, 4 checklists distintos, 2026-05-24 a 2026-05-28. 17 status=confirmed; 5 linkadas a assumption (execução iniciada); 12 órfãs (confirmed sem execução real) |
| `notifications` RECEIVING_* | **3** | Todas tipo RECEIVING_PENDING_CONFIRMATION, criadas em 2026-05-24. 1 não lida, 2 lidas |
| `checklists.receiving_mode` preenchido | **8** | Mesmo conjunto dos 4 legacy desativados (s57) + outros 4 criados antes do refactor |
| `checklists.receiving_generation` preenchido | **8** | Idem |
| `checklists.supplier_name` preenchido | **8** | Idem |
| `checklists.supplier_id` (FK nova) | 0 | Etapa 3 não criou execuções neste tenant ainda |
| `areas.allow_manual_receiving=true` | **3** | Áreas marcadas; flag dormente após Etapa 3 |

**Em produção:** os números serão diferentes mas a topologia é a mesma — `receiving_expectations` e notificações RECEIVING_* podem ser maiores; `checklists` legacy de receiving variam por tenant.

---

## 3. Código — referências ativas restantes (TS/TSX)

### 3.1 `receiving_expectations` (tabela / type)
**Zero refs ativas** no código TS. Apenas 3 hits em **comentários** (turno/page.tsx, turno/atividade, lib/types).

### 3.2 `RECEIVING_OVERDUE` / `RECEIVING_PENDING_CONFIRMATION`
**Zero refs ativas** no código TS. Tudo já foi removido na Etapa 4.

### 3.3 `receiving_mode` / `receiving_generation` / `supplier_name` — **ATENÇÃO: AINDA EM USO**

| Arquivo:linha | O que faz | Severidade |
|---|---|---|
| [app/api/tasks/kanban/route.ts:98](app/api/tasks/kanban/route.ts) | SELECT inclui `receiving_mode, supplier_name` no checklistSelect | 🔴 quebra runtime após DROP |
| [app/api/checklists/route.ts:226,334-336](app/api/checklists/route.ts) | POST aceita receiving_mode/generation/supplier_name no body e insere | 🔴 quebra runtime |
| [app/api/checklists/[id]/route.ts:34,161-163](app/api/checklists/[id]/route.ts) | PATCH aceita e atualiza | 🔴 quebra runtime |
| [app/api/receiving/executions/route.ts:69,135,137](app/api/receiving/executions/route.ts) | SELECT inclui supplier_name como fallback legacy | 🔴 quebra runtime |
| [app/(app)/turno/page.tsx:300](app/(app)/turno/page.tsx) | Lê `cl.supplier_name` na meta do card | 🟡 quebra TS, runtime degrada (undefined) |
| [app/(app)/turno/atividade/[id]/page.tsx:125](app/(app)/turno/atividade/[id]/page.tsx) | Lê supplier_name como fallback | 🟡 quebra TS |
| [lib/types/index.ts:127-129](lib/types/index.ts) | Campos no `Checklist` | 🟡 dead types após DROP |

### 3.4 `allow_manual_receiving` — **ATENÇÃO: AINDA EM USO**

| Arquivo:linha | O que faz | Severidade |
|---|---|---|
| [app/(app)/configuracoes/_components/areas-tab.tsx:66,102,111,238](app/(app)/configuracoes/_components/areas-tab.tsx) | Form checkbox + UPSERT + badge no list | 🔴 quebra runtime |
| [app/api/areas/route.ts:123,164](app/api/areas/route.ts) | POST aceita e insere | 🔴 quebra runtime |
| [app/api/areas/[id]/route.ts:69-70](app/api/areas/[id]/route.ts) | PATCH aceita e atualiza | 🔴 quebra runtime |
| [app/api/user-areas/route.ts:49](app/api/user-areas/route.ts) | SELECT inclui no relacionamento area | 🔴 quebra runtime |
| [app/(app)/turno/page.tsx:211](app/(app)/turno/page.tsx) | Lê para campo `allowManualReceiving` (dormente após Etapa 3) | 🟡 quebra TS |
| [lib/types/index.ts:291](lib/types/index.ts) | Campo em `Area` | 🟡 dead type |
| [lib/hooks/use-areas.ts:65,87-89,104,127-129](lib/hooks/use-areas.ts) | Tipos de payload + comentários | 🟡 quebra TS |

### 3.5 Hooks/imports legacy (`@/lib/hooks/use-receiving`)
**Zero refs ativas.** Hook file deletado na Etapa 4.

### 3.6 Endpoints legacy (`/api/receiving-expectations`, `/api/receiving/quick`, `/api/receiving/templates`)
**Zero refs ativas.** Endpoints deletados na Etapa 4.

---

## 4. Dados históricos — o que se perde com a Etapa 5

### 4.1 Tabela `receiving_expectations` (17 linhas no nonprod)
| Aspecto | Decisão |
|---|---|
| **Perde:** 17 registros de expectativa (data esperada, janela, status confirmed, vínculo com manager confirmador). | Histórico read-only sem UI. |
| **Continua auditável:** as 5 execuções com `assumption_id` populado → as próprias `checklist_assumptions` ficam intactas (são FK independente). | Sim. Histórico real da execução preservado em `/checklists` aba Execuções (Etapa 4). |
| **Precisa exportar antes?** | **Opcional.** Snapshot SQL recomendado se houver compliance. Dump JSON via MCP. |

### 4.2 Notificações `RECEIVING_PENDING_CONFIRMATION` (3 linhas no nonprod)
| Aspecto | Decisão |
|---|---|
| **Perde:** as 3 notificações + acesso ao tipo no check constraint | UI já não tem link funcional (Etapa 4 deletou `/admin/recebimentos`). |
| **Continua auditável:** `event_logs` se houver | Não — notifications não passa por event_logs. |
| **Precisa migrar?** | **Sim, dado constraint:** as 3 linhas precisam ser **deletadas ou retipadas** antes de remover do CHECK, senão a alteração do constraint falha. |

### 4.3 Colunas `checklists.receiving_mode`/`generation`/`supplier_name`
| Aspecto | Decisão |
|---|---|
| **Perde:** info de config dos 8 checklists legacy (4 do backfill desativados + 4 antigos) | Esses checklists já estão `active=false`. Config era para materialização, que foi desligada. |
| **Continua auditável:** execuções históricas em `checklist_assumptions` + `task_executions` intactas | Sim. |
| **Precisa exportar?** | **Não relevante.** Esses 8 checklists ficaram desativados na s57; o histórico de execução (assumptions) é independente. |

### 4.4 Coluna `areas.allow_manual_receiving`
| Aspecto | Decisão |
|---|---|
| **Perde:** flag em 3 áreas | Sem efeito operacional após Etapa 3. |
| **Precisa exportar?** | Não. |

---

## 5. Classificação final por item

| Item | Status |
|---|---|
| Tabela `receiving_expectations` | **Pode remover agora** (após code cleanup §3) |
| Indexes em `receiving_expectations` | Removidos automaticamente com a tabela |
| FKs saindo de `receiving_expectations` | Removidas com a tabela |
| Policies RLS em `receiving_expectations` | Removidas com a tabela |
| `notifications` types RECEIVING_* (check constraint) | **Pode remover agora** (após DELETE das 3 linhas) |
| 3 notifications RECEIVING_PENDING_CONFIRMATION | **Deletar** antes de refazer constraint |
| Colunas `checklists.receiving_mode`/`generation`/`supplier_name` | **Pode remover agora** (após code cleanup §3) |
| Coluna `areas.allow_manual_receiving` | **Pode remover agora** (após code cleanup §3) |
| Campos em `lib/types/index.ts` (`Checklist.receiving_mode`/etc., `Area.allow_manual_receiving`) | **Remover junto com código** |
| Migrations s48-s54 (histórico) | **Manter permanentemente** |
| Comentários menções a Etapa 4 / receiving_expectations em comentários | Cosmético — pode manter para contexto |

---

## 6. Bloqueador real?

**Não há bloqueador absoluto**, mas **a Etapa 5 NÃO é só migration**. Tentar dropar schema sem antes limpar o código TS quebra:

- **POST/PATCH `/api/checklists`** — tenta inserir colunas inexistentes (500 em produção)
- **GET `/api/tasks/kanban`** — SELECT inclui colunas inexistentes (500)
- **POST/PATCH `/api/areas`** — idem
- **GET `/api/user-areas`** — idem
- **GET `/api/receiving/executions`** — idem
- **Form `/configuracoes` tab Áreas** — submit quebra
- **`/turno` e `/turno/atividade`** — TS error, runtime degrada (campos undefined)

Logo, a Etapa 5 obriga:
1. **Code cleanup TS** (pré-requisito)
2. **Data cleanup** (DELETE das 3 notifications)
3. **Schema drop** (migration)

Tudo numa mesma branch, idealmente 2 commits (limpeza + migration) para rollback granular.

---

## 7. Plano único de execução

### Commit 1 — Code cleanup TS

**Arquivos a editar (10):**

1. `app/api/tasks/kanban/route.ts` — remover `receiving_mode, supplier_name` do checklistSelect (linha 98)
2. `app/api/checklists/route.ts` — remover do destructure (linha 226), do INSERT (linhas 334-336)
3. `app/api/checklists/[id]/route.ts` — idem para PATCH (linhas 34, 161-163)
4. `app/api/receiving/executions/route.ts` — remover supplier_name do SELECT, do payload e do fallback de render
5. `app/(app)/configuracoes/_components/areas-tab.tsx` — remover checkbox, state `formAllowManualReceiving`, badge no list e UPSERT
6. `app/api/areas/route.ts` — remover `allow_manual_receiving` do body parse e INSERT
7. `app/api/areas/[id]/route.ts` — remover do body parse e UPDATE
8. `app/api/user-areas/route.ts` — remover `allow_manual_receiving` do SELECT
9. `app/(app)/turno/page.tsx` — remover propriedade `allowManualReceiving` do map; remover leitura de `cl.supplier_name` na meta
10. `app/(app)/turno/atividade/[id]/page.tsx` — remover fallback `supplier_name`
11. `lib/types/index.ts` — remover campos `receiving_mode`, `receiving_generation`, `supplier_name` de `Checklist`; remover `allow_manual_receiving` de `Area`
12. `lib/hooks/use-areas.ts` — remover `allow_manual_receiving` dos interfaces de variables; limpar comentários obsoletos

**Validação:**
- `npx tsc --noEmit` — zero erros novos vs baseline
- `npm run build` — passa
- grep final: zero refs ativas em código TS (apenas comentários históricos permitidos)

### Commit 2 — Data cleanup + schema drops (migration s60)

```sql
-- supabase/migrations/<YYYYMMDD>_s60_drop_receiving_legacy.sql
BEGIN;

-- 1. Limpa as 3 notificações RECEIVING_PENDING_CONFIRMATION (necessário para refazer CHECK)
DELETE FROM public.notifications
 WHERE type IN ('RECEIVING_OVERDUE','RECEIVING_PENDING_CONFIRMATION');

-- 2. Refaz check constraint sem os tipos legacy
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'TASK_COMPLETED_WITH_NOTE'::text,
    'NEW_TASK_ASSIGNED'::text,
    'NEW_TASK_FOR_AREA'::text,
    'PASSWORD_CHANGED_BY_ADMIN'::text
  ]));

-- 3. Drop tabela receiving_expectations (CASCADE não necessário — só FKs out)
DROP TABLE IF EXISTS public.receiving_expectations CASCADE;

-- 4. Drop colunas legacy em checklists
ALTER TABLE public.checklists
  DROP COLUMN IF EXISTS receiving_mode,
  DROP COLUMN IF EXISTS receiving_generation,
  DROP COLUMN IF EXISTS supplier_name;

-- Drop check constraints associados (se ainda existirem)
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_receiving_mode_chk;
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_receiving_generation_chk;

-- 5. Drop coluna allow_manual_receiving em areas
ALTER TABLE public.areas DROP COLUMN IF EXISTS allow_manual_receiving;

COMMIT;
```

### Ordem de deploy

| # | Passo | Por quê |
|---|---|---|
| 1 | Merge da branch da Etapa 5 em `develop` | Code cleanup vai pra nonprod junto com a migration |
| 2 | Aplicar s60 no nonprod via MCP | Banco e código sincronizados |
| 3 | Smoke: `/turno`, `/configuracoes`, `/checklists`, POST/PATCH checklists, POST/PATCH areas | Confirma zero regressão |
| 4 | PR `develop → main` | Promove pra produção |
| 5 | Aplicar s60 no PROD via MCP **DEPOIS** do deploy do código | Code antigo (sem cleanup) leria colunas inexistentes → 500. Mandatório nessa ordem |

### Rollback

| Cenário | Como reverter |
|---|---|
| Código TS quebrado após merge | `git revert` do commit + redeploy |
| Migration quebra em prod | Re-criar via `CREATE TABLE`/`ADD COLUMN` (recuperar definição das migrations s48-s52 originais). **Dados** ficam perdidos a menos que tenha snapshot prévio |
| Apenas notifications precisam voltar | Re-adicionar tipos no CHECK; dados das 3 originais não voltam |

**Recomendação:** snapshot SQL do nonprod antes de aplicar s60, especialmente do conteúdo de `receiving_expectations` e das colunas legacy de `checklists` para 8 rows. Snapshot do prod **mandatório** antes do passo 5.

### Validações pós-migração

```sql
-- (a) Confirma drop completo
SELECT
  (SELECT to_regclass('public.receiving_expectations') IS NULL) AS recv_exp_dropped,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='checklists'
      AND column_name IN ('receiving_mode','receiving_generation','supplier_name')) AS legacy_cols_remaining,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='areas'
      AND column_name = 'allow_manual_receiving') AS area_flag_remaining,
  (SELECT count(*) FROM notifications WHERE type LIKE 'RECEIVING_%') AS legacy_notifs_remaining;

-- Esperado: { true, 0, 0, 0 }

-- (b) Confirma que features Etapa 2 seguem operacionais
SELECT count(*) FROM receiving_templates;
SELECT count(*) FROM receiving_template_tasks;
SELECT count(*) FROM suppliers;
-- Funções continuam:
SELECT proname FROM pg_proc WHERE proname IN ('instantiate_receiving_execution','replace_receiving_template_tasks');
```

### Impacto em produção

| Item | Impacto | Mitigação |
|---|---|---|
| Drop `receiving_expectations` | Perda de N linhas históricas (depende do tenant) | Snapshot pré-migration via `pg_dump` específico da tabela. Sem UI para visualizar mesmo se preservasse |
| Drop colunas em `checklists` | 8+ linhas com info de config legacy perdem campos | Esses checklists estão `active=false` — só estética histórica |
| Drop `areas.allow_manual_receiving` | 3+ áreas perdem flag | Sem efeito operacional pós-Etapa 3 |
| Refaz `notifications_type_check` | 3+ notificações RECEIVING_* deletadas | Já não tinham link funcional após Etapa 4 |
| Code cleanup | API limpa, formulários sem campos órfãos | Smoke test |

**Janela recomendada:** baixo tráfego. Migração roda em segundos (drops sem reescrita massiva).

---

## 8. Veredito

✅ **Auditoria concluída. Sem bloqueador absoluto.** Plano único entregue (§7).

**Próxima ação recomendada:** aprovar plano e iniciar Etapa 5 — code cleanup primeiro, migration s60 depois, branch única com 2 commits.
