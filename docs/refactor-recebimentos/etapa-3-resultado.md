# Etapa 3 — Resultado

**Escopo:** UI do Meu Turno migrada para o novo fluxo entregue na Etapa 2. Backend intocado.

---

## 1. Arquivos alterados

| Arquivo | Tipo | Mudança |
|---|---|---|
| [app/(app)/turno/page.tsx](app/(app)/turno/page.tsx) | UI + Query + Comportamento | refator completo: novo botão + modal multi-step, bloco "Executando", tab "Concluídas", recebimentos saem da lista principal |

**Nada mais foi tocado.** Sem migrations, sem mudança de contratos, sem novos hooks/endpoints.

## 2. Mudanças de UI

### 2.1 Botão "+ Novo Recebimento"
- **Antes:** visível quando `area.allow_manual_receiving === true`.
- **Agora:** visível quando há ao menos um modelo disponível hoje no escopo do usuário (`availableTemplates` filtrado por área ativa). Estado disabled-com-mensagem omitido (limitação documentada — não bloqueante; ver §5).

### 2.2 Modal de novo recebimento (2 etapas)
- **Step 1 — Modelo:** lista templates de `useReceivingTemplatesAvailable`, mostrando nome, qtd de tarefas e área.
- **Step 2 — Fornecedor:** toggle entre "Escolher existente" (dropdown de `useSuppliers`) e "Cadastrar novo" (form nome + CNPJ opcional).
- **Idempotency key estável:** UUID gerado via `crypto.randomUUID()` quando o modal abre; reusado durante todo o ciclo do modal; resetado quando fecha.
- **Tratamento de erro:** se RPC retorna `TEMPLATE_NOT_AVAILABLE`, mensagem dedicada solicita refresh do picker.

### 2.3 Bloco "Executando"
- Sub-componente novo `ExecutandoBlock` no final do arquivo.
- Colapsável (`<details>`), default aberto até 3 itens, recolhido a partir disso para preservar mobile.
- Visual destacado (border + bg azul) com ícone pulsante.
- Mostra rotinas + recebimentos com assumption `in_progress`. Items saem da lista principal para evitar duplicação.

### 2.4 Tabs de filtro
- 4 chips: Todas / Rotinas / Recebimentos / Concluídas.
- Modelos não contam (não estão em `operations`, são entidade separada em `receiving_templates`).
- Tab "Concluídas" abre por default o grupo `done` na lista (sem nova tela).

### 2.5 Lista principal
- Recebimentos não vêm mais de `ReceivingExpectation`. Cada execução criada via instantiate é um checklist normal (`is_one_shot=true`, `checklist_type='receiving'`) e entra naturalmente pelo `useKanbanTasks`.
- Items em `in_progress` migrados para o bloco "Executando" — não aparecem na lista principal.

## 3. Mudanças de query/comportamento

| Hook anterior | Status | Substituto |
|---|---|---|
| `useReceivingExpectations` | removido do `page.tsx` | nenhum — execuções entram via `useKanbanTasks` (Fix B já cobre in_progress) |
| `useReceivingTemplates` (legacy, `lib/hooks/use-receiving.ts`) | removido do `page.tsx` | `useReceivingTemplatesAvailable` da Etapa 2 |
| `useCreateQuickReceiving` | removido do `page.tsx` | `useInstantiateReceiving` da Etapa 2 (com `supplier_new` para casos antes feitos via quick) |
| dedupe `checklistIdsCoveredByExpectations` | removida | desnecessária |

Os hooks legacy continuam existindo (`use-receiving.ts` intacto) para o admin `/admin/recebimentos` legacy. Etapa 4 os desliga.

## 4. Validação

### 4.1 Type-check
- `npx tsc --noEmit`: 17 erros totais, todos pré-existentes em arquivos não tocados (shifts-tab, receiving-expectations, control-hub-admin, automation/queries.ts, e 2 em turno/page.tsx em linhas pré-existentes que apenas mudaram de número por imports adicionados).
- **Zero erros novos introduzidos pela Etapa 3.**

### 4.2 Comportamento esperado (smoke a executar no browser)

| # | Requisito | Como validar |
|---|---|---|
| 1 | Botão visível só com modelos disponíveis | Login owner → `/turno` → ver botão (4 templates ativos no nonprod no restaurante de teste). Login em restaurante sem templates → botão oculto. |
| 2 | Visibilidade por área | Trocar tab de área → botão mostra/oculta conforme `area_id` dos templates. |
| 3 | Visibilidade por role / usuário | Templates com `assigned_to_user_id` set só aparecem para o user específico. |
| 4 | N execuções/dia | Instanciar o mesmo modelo 2× com fornecedores diferentes → 2 cards na lista. |
| 5 | Fornecedor no momento da execução | Modal step 2: dropdown lista suppliers existentes. |
| 6 | Fornecedor criado pelo colaborador | Modal step 2: toggle "Cadastrar novo" → nome + CNPJ → `supplier_new` no instantiate. |
| 7 | Execução `in_progress` | Após confirmar → redirect direto pra `/turno/atividade/:id/executar`. |
| 8 | Navegação direta | `router.push(...executar)` no `onSuccess`. |
| 9 | Bloco "Executando" | Item recém-instanciado aparece no topo. |
| 10 | Modelo nunca aparece como atividade | `receiving_templates` não está em `operations` — estrutural. |
| 11 | Execução aparece normalmente | Cards usam `TaskRow` padrão. |
| 12 | Recorrência só para disponibilidade | `/available` filtra; cards são one-shot. |
| 13 | Modelo continua disponível | Template não é alterado pelo instantiate. |
| 14 | Zero `receiving_expectations` | Grep no `page.tsx`: zero. |
| 15 | Zero overdue/pending | Idem. |
| 16 | Filtros corretos | 4 tabs renderizadas; contadores excluem done na "Todas". |
| 17 | Realtime/cache | `useInstantiateReceiving` invalida `kanban`, `my-activities`, `my-activities-badge`, `suppliers*`. |
| 18 | Idempotência | Chave gerada uma vez por abertura do modal; reusada em retries. |

### 4.3 Achados durante implementação
**Bloqueante:** zero.
**Não bloqueante:**
- "Botão visível mas disabled com mensagem" não implementado (limitação documentada em `etapa-3-analise-impacto.md` §Achado 1) — exigiria 2ª query/permissão sobre `GET /api/receiving-templates` ou novo param em `/available`, ambos violando "não alterar contratos da Etapa 2".

## 5. Não tocado (conforme escopo)

- Schema, migrations, RPCs.
- Endpoints, payloads, hooks da Etapa 2.
- Materialização legacy (`lib/receiving/materialize.ts`), sweeper, expectations.
- `app/(app)/admin/recebimentos/*` (legacy admin) — segue funcionando.
- `lib/hooks/use-receiving.ts` (legacy) — segue funcionando para admin.
- `components/checklists/checklist-form.tsx` (form com receiving_mode) — fica para Etapa 5.

## 6. Próxima etapa

**Etapa 4** — desligamento do legacy:
- Parar materialização preguiçosa em `/api/receiving-expectations`.
- Desligar sweeper.
- Remover notificações `RECEIVING_OVERDUE` / `RECEIVING_PENDING_CONFIRMATION`.
- Migrar `/admin/recebimentos` para tela de histórico + CRUD de templates.

**Etapa 5** — limpeza de schema (depois de N dias de estabilidade pós-Etapa-4):
- Drop `receiving_expectations`.
- Drop colunas obsoletas (`receiving_mode`, `receiving_generation`, `supplier_name`, `is_one_shot` se aplicável).
- Drop `areas.allow_manual_receiving`.
- Drop tipos de notificação não usados.
