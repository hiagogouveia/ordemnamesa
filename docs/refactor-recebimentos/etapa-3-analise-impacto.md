# Etapa 3 — Análise de impacto pré-implementação

## Arquivos a alterar

| Arquivo | Classificação | Mudança |
|---|---|---|
| [app/(app)/turno/page.tsx](app/(app)/turno/page.tsx) | UI + Query + Comportamento | refator grande do Meu Turno: substituir botão/modal, novo bloco "Executando", remover recebimentos da lista principal, adicionar filtro "Concluídas" |

## Hooks consumidos (já entregues nas Etapas 1+2 — sem alteração)

- `useReceivingTemplatesAvailable` — picker (Etapa 2)
- `useInstantiateReceiving` — instantiate (Etapa 2, com fix da invalidation key já aplicado)
- `useSuppliers` — dropdown de fornecedores (Etapa 1)
- `useCreateSupplier` — não usado diretamente (criação inline vai via `supplier_new` no instantiate)

## Hooks abandonados no Meu Turno (continuam existindo para legacy admin)

- `useReceivingExpectations` — não consumido mais no `page.tsx`
- `useReceivingTemplates` (de `use-receiving.ts` — picker legacy) — não consumido mais
- `useCreateQuickReceiving` — não consumido mais (instantiate substitui ad-hoc também na prática; quando user precisa criar sem modelo, abre modal de "supplier_new")

## Achados (não-bloqueantes)

### Achado 1 — "Botão visível mas disabled com mensagem"
**Requisito:** quando há modelos para a área mas nenhum disponível hoje → botão disabled.

**Limitação:** o endpoint `/available` filtra por recorrência+hoje. Para staff distinguir "tem modelo mas não hoje" de "não tem nenhum", precisaríamos de uma 2ª query que liste templates da área sem filtro de hoje. O endpoint `GET /api/receiving-templates` permite isso, mas hoje bloqueia role=staff (regra do plano original).

**Resolução escolhida sem violar contratos:** botão visível só quando `availableTemplates.length > 0`. Estado "disabled com mensagem" omitido. UX leve perda — staff que tem modelos cadastrados mas que não batem hoje simplesmente não vê o botão. Não bloqueante.

**Sugestão de evolução futura (fora do escopo):** relaxar GET `/api/receiving-templates` para qualquer membro (RLS já permite leitura por membros via `is_restaurant_member`); ou adicionar `&date=any` em `/available`. Decisão para Etapa 5 ou produto.

### Achado 2 — Tab "Concluídas" duplica seção colapsável existente
Hoje "Concluídas" já existe como grupo recolhível dentro da lista. Adicionar uma tab dedicada cria duplicação visual. Mantém ambas para satisfazer o requisito 6 — não bloqueante. UX: tab atua como atalho visual ao mesmo conteúdo, com a lista principal escondendo pendentes.

## Comportamento removido (intencional, alinhado ao plano da Etapa 4)

- Cards de `ReceivingExpectation` (pending/confirmed/overdue) param de renderizar no Meu Turno.
- Notificações vermelhas de overdue continuam vindo do legacy mas perdem ponto de entrada via UI.
- Botão "Recebimento rápido" (form livre de tasks) some — substituído pelo fluxo modelo→fornecedor (inclui criação inline de fornecedor).
- `useReceivingExpectations` ainda funciona; admin/recebimentos legacy continua intacto. Etapa 4 desliga.

## Resumo classificado

| Categoria | Itens |
|---|---|
| UI | botão fixo, novo modal multi-step, bloco "Executando", filtro "Concluídas" |
| Hook | nenhum novo (consumo de hooks da Etapa 1+2) |
| Query | parar de consumir `useReceivingExpectations`, `useReceivingTemplates` legacy, `useCreateQuickReceiving` |
| Comportamento | recebimentos saem da lista principal; modelos nunca aparecem (estrutural); execuções entram naturalmente via kanban+Fix B |

Zero bloqueantes. Prossigo.
