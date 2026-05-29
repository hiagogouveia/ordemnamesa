# Etapa 2 — Resultado

**Projeto:** `mkwxulikizrfdupqpyrn` (nonprod).
**Data de conclusão:** 2026-05-29.
**Escopo entregue:** backend completo do novo fluxo (modelos + instanciação), sem qualquer mudança em UI operacional.

---

## 1. Migrations aplicadas

| Migration | Arquivo | Aplicada |
|---|---|---|
| `s58_checklists_idempotency` | `supabase/migrations/20260529_s58_checklists_idempotency.sql` | ✅ |
| `s59_rpc_instantiate_receiving` | `supabase/migrations/20260529_s59_rpc_instantiate_receiving.sql` | ✅ |
| `s59b_fix_shift_default_in_rpc` (hotfix) | aplicado via MCP; arquivo SQL editado | ✅ |

Achado durante smoke: coluna `checklists.shift` é NOT NULL — a versão inicial do RPC passava NULL. Hotfix imediato: passar literal `'any'` (semântica "qualquer turno", igual aos legados). Classificado como bloqueante (RPC não funcionava); corrigido no mesmo passo.

---

## 2. Endpoints publicados

| Rota | Métodos | Permissão | Função |
|---|---|---|---|
| `/api/receiving-templates` | GET, POST | owner/manager | listar / criar modelo |
| `/api/receiving-templates/[id]` | GET, PATCH, DELETE | GET=membro; PATCH/DELETE=owner/manager | detalhe com tasks / editar (replace tasks via RPC) / soft-archive |
| `/api/receiving-templates/available` | GET | qualquer membro com área | modelos disponíveis HOJE pelo escopo do user |
| `/api/receiving/instantiate` | POST | qualquer membro com área | cria execução one-shot via RPC transacional |

Auth pattern consistente com restante do projeto: Bearer token → `adminSupabase.auth.getUser` → membership via `restaurant_users` → escopo via `user_areas`/`user_roles` quando relevante.

`/instantiate` aceita `supplier_id` OU `supplier_new` (mutuamente exclusivos). Se `supplier_new`, cria supplier antes do RPC; em caso de conflito por nome (`23505`), reusa o existente.

---

## 3. RPCs criadas

### `instantiate_receiving_execution`
Função `SECURITY DEFINER` com `search_path` fixo. Sem lógica de permissão — caller (route handler) já validou auth/escopo. Faz, em transação real:
1. Idempotency check — se `idempotency_key` já existe, retorna a execução existente com `was_duplicate=true`.
2. Snapshot do template ativo (`RAISE EXCEPTION 'TEMPLATE_NOT_AVAILABLE'` se inexistente/arquivado).
3. INSERT `checklists` com `is_one_shot=true`, `source_template_id`, `supplier_id`, `idempotency_key`, `shift='any'`.
4. INSERT bulk `checklist_tasks` clonando `receiving_template_tasks`.
5. INSERT `checklist_assumptions` já em `in_progress`.

### `replace_receiving_template_tasks`
DELETE + INSERT atômico das tasks de um template a partir de array JSONB. Usado pelo POST (após insert) e PATCH (quando body inclui `tasks`).

---

## 4. Hooks publicados

| Hook | Tipo |
|---|---|
| `useReceivingTemplates(restaurantId, includeInactive)` | query — lista |
| `useReceivingTemplate(restaurantId, templateId)` | query — detalhe com tasks |
| `useReceivingTemplatesAvailable(restaurantId, areaId?)` | query — picker |
| `useCreateReceivingTemplate` | mutation |
| `useUpdateReceivingTemplate` | mutation (suporta PATCH parcial + replace de tasks) |
| `useArchiveReceivingTemplate` | mutation (soft-delete) |
| `useInstantiateReceiving` | mutation (caller fornece `idempotency_key`; hook não gera automaticamente para forçar estabilidade durante a vida do modal) |

Invalidação de cache pós-mutation:
- create/update/archive template → invalida `receiving-templates`, `receiving-template`, `receiving-templates-available`.
- instantiate → invalida `tasks-kanban`, `my-activities`, `my-activities-badge`; e `suppliers*` se `supplier_new` foi enviado.

---

## 5. Field mapping aplicado (auditável)

Conforme §5 do plano técnico. Confirmado via SQL no smoke test.

| Origem | Vai para execução? | Verificado |
|---|---|---|
| `template.name` | ✅ → `checklists.name` | ✅ "recebimento 2 CAIXA" preservado |
| `template.description` | ✅ → `checklists.description` | ✅ |
| `template.area_id` | ✅ → `checklists.area_id` | ✅ `56e782a0…` |
| `template.role_id` | ✅ → `checklists.role_id` | ✅ |
| `template.assigned_to_user_id` | ✅ → `checklists.assigned_to_user_id` | ✅ |
| `template.enforce_sequential_order` | ✅ | ✅ |
| `template_tasks.*` (9 campos) | ✅ via clone bulk | ✅ snapshot 2/2 idêntico ao template |
| `template.recurrence` / `recurrence_config` / `shift` | ❌ (one-shot operacional) | ✅ execução tem `shift='any'`, sem recurrence |
| `template.id` | → `checklists.source_template_id` (FK) | ✅ |
| supplier escolhido | → `checklists.supplier_id` | ✅ |
| idempotency_key | → `checklists.idempotency_key` | ✅ |
| literal `checklist_type='receiving'` | ✅ | ✅ |
| literal `is_one_shot=true` | ✅ | ✅ |
| literal `active=true`, `status='active'` | ✅ | ✅ |
| `created_by = staff.user_id` | ✅ | ✅ |

`checklist_assumptions`:
- `execution_status='in_progress'` ✅
- `user_id` + `user_name` resolvidos pelo handler antes do RPC ✅
- `date_key` em TZ Brasil ✅

---

## 6. Smoke test SQL no NONPROD

| Pass | Cenário | Resultado |
|---|---|---|
| 1 | Instantiate nova execução (key A) | `was_duplicate=false`, checklist + 2 tasks + 1 assumption criados |
| 2 | Re-instantiate com mesma key A | `was_duplicate=true`, mesmos IDs retornados, sem nova linha |
| 3 | Instantiate com key B no mesmo template | `was_duplicate=false`, 2ª execução criada (mesmo template → N execuções no dia) |
| 4 | Snapshot check da execução do PASS 1 | `is_one_shot=true`, `source_template_id` e `supplier_id` corretos, 2 tasks snapshot, 1 assumption `in_progress` |
| 5 | Template arquivado → instantiate com key C | `EXCEPTION TEMPLATE_NOT_AVAILABLE` levantada (caller traduz para HTTP 409) |
| 6 | Limpeza | 2 execuções + 1 supplier de teste removidos; estado pré-smoke restaurado |

Validação final do estado do banco após limpeza:
```
templates_ativos              = 4   (mesmos do backfill Etapa 0)
template_tasks                = 9
suppliers                     = 0
execucoes_de_template         = 0   (smoke fixtures removidas)
checklists_com_idempotency    = 0
```

---

## 7. TypeScript

`npx tsc --noEmit` em cada novo arquivo — zero erros. Nenhuma regressão em arquivos pré-existentes.

Arquivos novos:
- `app/api/receiving-templates/route.ts`
- `app/api/receiving-templates/[id]/route.ts`
- `app/api/receiving-templates/available/route.ts`
- `app/api/receiving/instantiate/route.ts`
- `lib/hooks/use-receiving-templates.ts`
- `lib/hooks/use-receiving-instantiate.ts`

Arquivos não alterados (conforme escopo isolado):
- Meu Turno (`app/(app)/turno/page.tsx`)
- Admin de recebimentos legacy (`app/(app)/admin/recebimentos/*`)
- Form de checklist (`components/checklists/checklist-form.tsx`)
- Materialização legacy (`lib/receiving/materialize.ts`)
- Qualquer endpoint `/api/receiving-expectations/*`

---

## 8. Achados durante a etapa

| Achado | Classificação | Resolução |
|---|---|---|
| `checklists.shift` NOT NULL — RPC passava NULL | bloqueante | s59b: literal `'any'` (mesma semântica do legado) |
| Helper `filterChecklistsByRecurrence` já é shared utility em `lib/utils/should-checklist-appear-today.ts` | informativo | passo §12.3 do plano (extração) virou no-op |

Nenhum outro achado bloqueante. Nenhuma regressão.

---

## 9. Próxima etapa

**Etapa 3** — UI nova de Meu Turno atrás de feature flag:
- bloco "Executando" colapsável misturando rotinas + recebimentos
- botão "+ Novo Recebimento" fixo, alimentado por `useReceivingTemplatesAvailable`
- modal de escolha modelo → fornecedor → instantiate
- remoção de recebimentos da lista principal de rotinas
- form de gestão de modelos (substituindo cadastro de receiving recurring no checklist-form)

Estado do schema pronto: `suppliers`, `receiving_templates`, `receiving_template_tasks`, `checklists.source_template_id`, `checklists.supplier_id`, `checklists.idempotency_key`. RPCs prontas. Endpoints prontos. Hooks prontos.
