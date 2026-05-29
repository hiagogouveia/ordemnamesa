# Etapa 4 — Desligamento do fluxo legacy de Recebimentos

**Escopo:** remover definitivamente todo o código TS do fluxo legacy (`receiving_expectations`, materialize, sweeper, pending confirmation, notification types, hooks/endpoints/UI legacy). Banco preservado para histórico.

---

## 1. Arquivos deletados (11)

### Endpoints legacy
- `app/api/receiving-expectations/route.ts` — GET com lazy materialize
- `app/api/receiving-expectations/[id]/route.ts` — confirm/cancel
- `app/api/receiving-expectations/counts/route.ts`
- `app/api/receiving-expectations/materialize/route.ts`
- `app/api/receiving-expectations/mark-overdue/route.ts` — sweeper
- `app/api/receiving/quick/route.ts` — quick ad-hoc
- `app/api/receiving/quick/history/route.ts` — renomeado para `/api/receiving/executions`
- `app/api/receiving/templates/route.ts` — picker legacy (substituído pelo `/api/receiving-templates/available` da Etapa 2)

### Frontend / hooks / utils
- `app/(app)/admin/recebimentos/page.tsx` — inbox legacy (pending/overdue/confirmados/cancelados)
- `lib/hooks/use-receiving.ts` — 8 hooks legacy (useReceivingCounts, useReceivingExpectations, useReceivingTemplates legacy, useConfirmExpectation, useCancelExpectation, useMarkOverdue, useQuickReceivingHistory, useCreateQuickReceiving)
- `lib/receiving/materialize.ts` — função `materializeReceivingForToday` + notificação `RECEIVING_PENDING_CONFIRMATION`

## 2. Arquivos criados (2)

- `app/api/receiving/executions/route.ts` — substitui semanticamente `/api/receiving/quick/history`. Mesma query (`is_one_shot=true AND checklist_type='receiving'`), agora retorna também `supplier` (FK) e `source_template_id` no payload.
- `lib/hooks/use-receiving-executions.ts` — hook `useReceivingExecutions` com tipo `ReceivingExecutionRow` que inclui `supplier?: { id, name }`, `supplier_name?: string | null` (legacy) e `source_template_id?: string | null`.

## 3. Arquivos adaptados (5)

| Arquivo | Mudança |
|---|---|
| [components/layout/sidebar.tsx](components/layout/sidebar.tsx) | Removido item de menu "Recebimentos" (link `/admin/recebimentos`), badge de overdue/pending, hook `useReceivingCounts`. |
| [components/checklists/management/ExecucoesView.tsx](components/checklists/management/ExecucoesView.tsx) | Trocado `useQuickReceivingHistory` por `useReceivingExecutions`. Render do supplier prioriza FK (`q.supplier?.name`) sobre texto livre legado. Badge "Rápido" virou "Legado" e só aparece quando `source_template_id IS NULL`. |
| [app/api/checklists/[id]/assume/route.ts](app/api/checklists/[id]/assume/route.ts) | Removidos os 2 blocos que faziam UPDATE em `receiving_expectations` (linking expectation → assumption). Removido `expectation_id` do body. |
| [lib/hooks/use-tasks.ts](lib/hooks/use-tasks.ts) | `useAssumeChecklist` deixa de enviar `expectation_id` no body. |
| [app/(app)/turno/atividade/[id]/page.tsx](app/(app)/turno/atividade/[id]/page.tsx) | Removidos `expectationId` (lido de searchParams) e passagem para `assumeMutation`. |
| [lib/types/index.ts](lib/types/index.ts) | Removidos `ReceivingExpectationStatus` e `ReceivingExpectation`. Comentário sinaliza substituição. |

## 4. O que NÃO foi tocado (preservado intencionalmente)

### Banco (preservação de histórico)
- Tabela `receiving_expectations` — vivas 17 linhas no nonprod, intactas. Etapa 5 dropa.
- Notification types `RECEIVING_OVERDUE` / `RECEIVING_PENDING_CONFIRMATION` — check constraint preservado para linhas históricas.
- Colunas `checklists.receiving_mode`, `receiving_generation`, `supplier_name` — dormentes em rows existentes; Etapa 5 dropa.
- Coluna `areas.allow_manual_receiving` — dormente; Etapa 5 dropa.
- Migrations s48-s52 — permanecem no histórico.

### Etapa 2 e Etapa 3 (não regredidas)
- `/api/receiving-templates/*` + `/api/receiving/instantiate` + RPCs s58/s59 — intactos.
- Hooks `use-receiving-templates.ts`, `use-receiving-instantiate.ts`, `use-suppliers.ts` — intactos.
- `app/(app)/turno/page.tsx` — Etapa 3 já havia deixado de consumir os hooks legacy; nenhuma mudança adicional.

## 5. Validação

### TypeScript
- `npx tsc --noEmit` retorna **13 erros, todos pré-existentes** em arquivos não tocados (shifts-tab, control-hub-admin, automation/queries, e 2 linhas pré-existentes em turno/page.tsx).
- **Zero erros novos introduzidos.**

### Grep órfãos (resultado final)
| Padrão | Hits | Análise |
|---|---|---|
| `receiving_expectations` | 4 | Apenas comentários (turno/page, turno/atividade, lib/types). Sem código ativo. |
| `materializeReceivingForToday` | 0 | Limpo. |
| `RECEIVING_OVERDUE` / `RECEIVING_PENDING_CONFIRMATION` | 0 no código TS | Permanecem só em migrations e DB. |
| `useReceivingCounts` etc. (8 hooks legacy) | 0 | Limpos. |
| `@/lib/hooks/use-receiving` (import legacy) | 0 | Hook file deletado. |
| `/api/receiving-expectations`, `/api/receiving/quick`, `/api/receiving/templates` legacy | 0 | Limpos. |
| `ReceivingExpectation` type | 0 fora de comentários | Limpo. |

### Comportamento operacional pós-merge
- **Meu Turno**: idêntico à Etapa 3 — fluxo de instantiate, bloco "Executando", tabs.
- **Sidebar manager**: perde o item "Recebimentos" (que apontava para a inbox legacy). O fluxo agora vive em `/turno` (criar) + `/checklists` aba Execuções (auditar).
- **`/checklists` aba Execuções**: continua funcional, agora alimentada por `/api/receiving/executions`, mostrando templates instanciados (badge "Modelo") + legacy (badge "Legado").
- **`/admin/recebimentos`**: 404. Página deletada. Sem regressão real porque o fluxo dela (confirm/cancel expectations) foi descontinuado.
- **Materialização**: cessou. Nenhum job/cron escreve mais em `receiving_expectations`. As 17 linhas legacy permanecem read-only.
- **Notificações**: nenhum producer mais. Notifications existentes do tipo `RECEIVING_*` continuam visíveis até serem marcadas como lidas; nenhuma nova é criada.

## 6. Migrations / Banco

**Nenhuma migration nesta etapa.** Banco intocado. A limpeza de schema (drop de tabela, colunas e types) é exclusiva da Etapa 5 — separada para permitir rollback fácil caso necessário.

## 7. Compatibilidade

| Cenário | Resultado |
|---|---|
| Restaurante sem modelos | Nenhuma diferença operacional vs Etapa 3. |
| Restaurante com modelos migrados (s57) | Botão "+ Novo Recebimento" + modelo + supplier. Continua funcionando. |
| Restaurante multi-área / multi-unidade | Sem regressão. |
| Usuário com `expectation_id` em URL salva (link antigo) | Param ignorado silenciosamente; activity page carrega normalmente. |
| Usuário com notificação `RECEIVING_OVERDUE` salva | Notificação mostra texto e link, mas link `/admin/recebimentos` 404 (degradação aceita). |
| Histórico auditável de receivings antigos | Acessível via `/checklists` aba Execuções (suporta legacy + novo). |
| Dashboard / Relatórios | Sem mudança — `OPERATIONAL_PREDICATE` já excluía receivings recurring legacy. |
| Multi-tenant / RLS | Sem mudança. |

## 8. Riscos residuais

1. **Notificações com link 404** — usuários que ainda têm `RECEIVING_OVERDUE`/`RECEIVING_PENDING_CONFIRMATION` na inbox podem clicar e cair em 404. Mitigação: sweep manual via SQL marcando-as como lidas, ou aceitar a degradação até elas expirarem por tempo. **Não bloqueante.**
2. **Banco com colunas/tabela dormentes** — `receiving_expectations` e `receiving_mode`/etc. continuam ocupando storage. Resolvido na Etapa 5.
3. **Histórico das 17 expectations** — preservado read-only; sem UI para visualizar. Aceitável.

## 9. Próxima etapa

**Etapa 5 (limpeza de schema, após N dias de estabilidade pós-Etapa 4):**
- DROP TABLE `receiving_expectations`
- DROP COLUMN `checklists.receiving_mode`, `receiving_generation`, `supplier_name`
- DROP COLUMN `areas.allow_manual_receiving`
- Remover `RECEIVING_OVERDUE` / `RECEIVING_PENDING_CONFIRMATION` do check constraint de notifications (depois de garantir que nenhuma row usa)
- Drop indices órfãos
