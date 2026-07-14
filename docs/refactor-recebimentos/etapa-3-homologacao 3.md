# Etapa 3 — Plano de Homologação Manual

**Ambiente alvo:** NONPROD (`mkwxulikizrfdupqpyrn`).
**Objetivo:** validar Etapas 0+1+2+3 ponta a ponta antes de aprovar a PR #11.
**Pré-execução comum:** `rm -rf .next && npm run dev` para garantir cache Tailwind v4 limpo.

---

## Setup inicial (uma vez)

Antes de começar a homologação, garantir no nonprod:

| Item | Como | Onde |
|---|---|---|
| Usuário **owner** | seu user (`hiago.gouveia@gmail.com`) | já existe |
| Usuário **manager** | criar via `/admin/colaboradores` ou usar existente | restaurante `cfd6f6ab…` |
| Usuário **staff A** | criar com vínculo na área "caixa" (`851c86c4…`) | mesma unidade |
| Usuário **staff B** | criar SEM vínculo em área | mesma unidade |
| Usuário **staff C** | criar com role específico (criar uma role nova "Recebedor" se necessário) | mesma unidade |
| 2º restaurante | usar segundo tenant para validar multi-tenant; criar se não existir | qualquer |
| Templates de teste | 4 já existem do backfill (verificar via SQL); criar 2 adicionais via cURL: um com `role_id` e um com `assigned_to_user_id` | restaurante `cfd6f6ab…` |
| Fornecedores de teste | criar 2 via tab Fornecedores: "Hortifruti CEASA" e "Frigorífico Friboi" | restaurante `cfd6f6ab…` |

Comando útil para criar template com role/user atribuído (substituir IDs):
```bash
curl -X POST https://nonprod/api/receiving-templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"restaurant_id":"...","name":"Receb. Carnes",
       "area_id":"...","role_id":"...",
       "recurrence":"daily",
       "tasks":[{"title":"Conferir temperatura","requires_photo":true},{"title":"Pesar mercadoria"}]}'
```

---

## PAPEL: STAFF

### S1 — Área sem modelos
**Pré:** staff B (sem área atribuída) OU staff em área que não tem nenhum template.
**Passos:**
1. Login → `/turno`.
2. Verificar header e lista.
**Esperado:**
- Botão "+ Novo Recebimento" **não aparece**.
- Sem mensagem de erro; lista renderiza normal (mostra rotinas se houver, ou empty state).
**Impacto se falhar:** botão "morto" gera frustração ou erros 4xx ao clicar.
**Classificação:** 🔴 **CRÍTICO**

---

### S2 — Área com modelos disponíveis
**Pré:** staff A na área "caixa" com pelo menos 1 template ativo com recorrência batendo hoje.
**Passos:**
1. Login → `/turno`.
2. Trocar tab de área (se houver múltiplas) para uma com modelo.
**Esperado:**
- Botão "+ Novo Recebimento" visível e ativo.
- Click abre modal step 1 com lista de modelos.
**Impacto se falhar:** novo fluxo inacessível.
**Classificação:** 🔴 **CRÍTICO**

---

### S3 — Área com modelos indisponíveis no dia
**Pré:** criar template com `recurrence='weekly'` em dia diferente de hoje (ex: terça quando hoje é quinta) na área "caixa".
**Passos:**
1. Confirmar via SQL que o template está ativo mas recorrência não bate.
2. Login → `/turno` → tab da área.
**Esperado (limitação documentada):**
- Botão **não aparece** (caso seja o único template; conforme Achado §5 do `etapa-3-resultado.md`).
- Se houver OUTRO template disponível hoje na mesma área, botão aparece e o picker NÃO mostra o template fora do dia.
**Impacto se falhar:** template fora-do-dia apareceria no picker e causaria expectativa errada.
**Classificação:** 🟡 **IMPORTANTE** (limitação UX já aceita; o crítico é o picker NÃO listar templates fora do dia)

---

### S4 — Modelo atribuído por área
**Pré:** template T1 na área "caixa" sem `role_id` e sem `assigned_to_user_id`.
**Passos:**
1. Staff A (vínculo em "caixa") → `/turno` → ver picker.
2. Staff em área diferente → `/turno`.
**Esperado:**
- Staff A vê T1 no picker.
- Staff de outra área não vê T1.
**Impacto se falhar:** vazamento de templates entre áreas / ocultação indevida.
**Classificação:** 🔴 **CRÍTICO**

---

### S5 — Modelo atribuído por role
**Pré:** template T2 com `role_id` = "Recebedor".
**Passos:**
1. Staff C (com role "Recebedor" em "caixa") → `/turno` → picker.
2. Staff A (sem role "Recebedor", mesma área) → `/turno` → picker.
**Esperado:**
- Staff C vê T2.
- Staff A **não vê** T2.
**Impacto se falhar:** template vaza para quem não tem role.
**Classificação:** 🟡 **IMPORTANTE**

---

### S6 — Modelo atribuído a usuário específico
**Pré:** template T3 com `assigned_to_user_id` = ID do staff A.
**Passos:**
1. Staff A → `/turno` → picker.
2. Outro staff na mesma área → `/turno` → picker.
**Esperado:**
- Staff A vê T3.
- Outro staff **não vê** T3.
**Impacto se falhar:** atribuição individual furada.
**Classificação:** 🟡 **IMPORTANTE**

---

### S7 — Seleção de fornecedor existente
**Pré:** ao menos 1 fornecedor ativo cadastrado.
**Passos:**
1. Staff A → abrir modal → step 1 escolher T1 → step 2.
2. Modo "Escolher existente" → dropdown.
3. Selecionar "Hortifruti CEASA" → "Iniciar".
**Esperado:**
- Dropdown popula com suppliers ativos.
- Confirmar redireciona para `/turno/atividade/<id>/executar`.
- DB: novo checklist com `supplier_id` apontando pro selecionado.
**Impacto se falhar:** fornecedor não associa à execução.
**Classificação:** 🔴 **CRÍTICO**

---

### S8 — Cadastro inline de fornecedor
**Pré:** modal aberto no step 2.
**Passos:**
1. Toggle para "Cadastrar novo".
2. Nome "Frigorífico Teste Inline", CNPJ "11.222.333/0001-44".
3. "Iniciar".
**Esperado:**
- Supplier criado em `suppliers` com `created_by` = staff A.
- Execução criada com `supplier_id` apontando para o novo.
- Redirect para execução.
- Após voltar, `/configuracoes?tab=fornecedores` (logado como owner/manager) mostra o novo fornecedor.
**Impacto se falhar:** supplier órfão ou execução sem fornecedor.
**Classificação:** 🔴 **CRÍTICO**

---

### S9 — Instanciação de recebimento (fluxo feliz completo)
**Pré:** template + supplier disponíveis.
**Passos:**
1. Modal → modelo → fornecedor → "Iniciar".
2. Aguardar redirect.
3. Voltar a `/turno`.
**Esperado:**
- HTTP 201 `{ checklist_id, assumption_id, was_duplicate:false }`.
- Página de execução carrega com as tasks do template.
- Voltar a `/turno`: aparece no bloco "Executando".
**Impacto se falhar:** todo o fluxo novo quebrado.
**Classificação:** 🔴 **CRÍTICO**

---

### S10 — Duplo clique no botão (idempotência)
**Pré:** modal step 2 pronto.
**Passos:**
1. Clicar "Iniciar" 2× rapidamente (ou ~500ms entre cliques).
**Esperado:**
- 1 única execução criada no DB.
- 2ª resposta tem `was_duplicate=true` com mesmos IDs.
- UI redireciona uma vez (o 2º estado pendente do mutation deve resolver sem erro visível).
**Validação adicional:** SQL `SELECT count(*) FROM checklists WHERE idempotency_key=<key>` deve ser 1.
**Impacto se falhar:** execuções duplicadas em produção sob rede flaky.
**Classificação:** 🔴 **CRÍTICO**

---

### S11 — Refresh durante instanciação
**Pré:** modal step 2 pronto, idempotency_key X já gerada.
**Passos:**
1. Clicar "Iniciar".
2. Refresh do browser (F5) ANTES de o redirect completar.
3. Voltar manualmente a `/turno`.
**Esperado:**
- Se a request chegou ao server: execução criada, aparece em "Executando".
- Se não chegou: nada criado; abrir modal novamente gera nova `idempotency_key`.
- Em nenhum caso há duplicidade.
**Impacto se falhar:** orphan executions ou perda de tracking.
**Classificação:** 🟡 **IMPORTANTE**

---

### S12 — Múltiplas execuções do mesmo modelo no mesmo dia
**Pré:** template T1 disponível, 2 fornecedores cadastrados.
**Passos:**
1. Instanciar T1 com "Hortifruti CEASA" → executar parcialmente.
2. Abrir modal novamente → escolher T1 (deve ainda aparecer) → escolher "Frigorífico Friboi" → "Iniciar".
**Esperado:**
- 2 execuções distintas no DB com mesmo `source_template_id` e diferentes `supplier_id`.
- Ambas aparecem no Meu Turno simultaneamente.
- Template T1 continua disponível para nova instanciação.
**Validação SQL:** `SELECT count(*) FROM checklists WHERE source_template_id='<T1>' AND DATE(created_at) = CURRENT_DATE` = 2.
**Impacto se falhar:** quebra premissa central do refator (mesmo modelo → N execuções).
**Classificação:** 🔴 **CRÍTICO**

---

### S13 — Recebimento aparece em "Executando"
**Pré:** acabou de instanciar.
**Passos:**
1. Voltar a `/turno`.
2. Verificar bloco "Executando" no topo.
**Esperado:**
- Card visível com nome do modelo e fornecedor (se TaskRow renderiza supplier).
- Default aberto (≤3 itens).
- Click no card abre execução.
**Impacto se falhar:** execução invisível para o colaborador.
**Classificação:** 🔴 **CRÍTICO**

---

### S14 — Recebimento aparece em "Recebimentos"
**Pré:** ao menos 1 execução de recebimento pendente OU em andamento criada.
**Passos:**
1. `/turno` → tab "Recebimentos".
**Esperado:**
- Mostra apenas execuções de receiving (pendentes na lista; em andamento ficam no bloco "Executando" acima).
- Contador da tab corresponde.
**Impacto se falhar:** filtragem por tipo quebrada.
**Classificação:** 🟡 **IMPORTANTE**

---

### S15 — Recebimento aparece em "Todas"
**Pré:** mistura de rotinas + recebimentos.
**Passos:**
1. `/turno` → tab "Todas".
**Esperado:**
- Lista intercala rotinas + recebimentos (pendentes).
- Items em "Executando" não duplicam na lista principal.
**Impacto se falhar:** UX confusa.
**Classificação:** 🟡 **IMPORTANTE**

---

### S16 — Modelo NÃO aparece como atividade na lista principal
**Pré:** ao menos 1 template ativo na área do staff.
**Passos:**
1. `/turno` → varrer todas as tabs.
2. Confirmar via DB: `SELECT count(*) FROM checklists WHERE id=<template_id>` retorna 0 (templates não vivem em checklists).
**Esperado:**
- Em nenhuma tab aparece o modelo como "atividade pendente".
- Modelo só aparece dentro do modal de "Novo Recebimento".
**Impacto se falhar:** poluição grave do Meu Turno; volta o problema que motivou o refator.
**Classificação:** 🔴 **CRÍTICO**

---

### S17 — Conclusão do recebimento
**Pré:** execução em andamento.
**Passos:**
1. Abrir a execução pelo card "Executando".
2. Concluir todas as tasks (com foto onde requerido).
3. "Concluir checklist".
**Esperado:**
- `checklist_assumptions.execution_status='done'`, `completed_at` populado.
- Redirect ou estado de "concluído" visível.
**Impacto se falhar:** colaborador trava no meio da execução.
**Classificação:** 🔴 **CRÍTICO**

---

### S18 — Movimentação Executando → Concluído
**Pré:** execução acabou de ser concluída.
**Passos:**
1. Voltar a `/turno`.
2. Observar bloco "Executando" e tab "Concluídas".
**Esperado:**
- Card sai do bloco "Executando".
- Card aparece no grupo "Concluídas" (recolhível) na lista principal e na tab "Concluídas".
- Contadores atualizados.
**Impacto se falhar:** card "fantasma" em execução.
**Classificação:** 🔴 **CRÍTICO**

---

### S19 — Atualização dos contadores
**Pré:** mistura de rotinas + recebimentos em vários estados.
**Passos:**
1. Verificar números nas 4 tabs.
2. Instanciar nova execução.
3. Re-verificar contadores.
**Esperado:**
- Contador "Recebimentos" e "Todas" aumenta em 1.
- "Concluídas" só aumenta após complete.
- Modelo nunca conta.
**Impacto se falhar:** dashboards de progresso ficam errados.
**Classificação:** 🟡 **IMPORTANTE**

---

### S20 — Atualização dos filtros
**Pré:** items em vários estados.
**Passos:**
1. Trocar entre "Todas / Rotinas / Recebimentos / Concluídas".
**Esperado:**
- Lista re-renderiza corretamente para cada filtro.
- Bloco "Executando" permanece visível independente do filtro.
- Tab "Concluídas" abre o grupo done por default.
**Impacto se falhar:** UX dos filtros quebrada.
**Classificação:** 🟡 **IMPORTANTE**

---

### S21 — Navegação direta para execução
**Pré:** modal pronto para confirmar.
**Passos:**
1. "Iniciar".
**Esperado:**
- Imediatamente redireciona para `/turno/atividade/<checklist_id>/executar`.
- Sem etapa intermediária "Assumir".
- Tasks já visíveis e prontas pra marcar.
**Impacto se falhar:** UX confusa, possível confusão sobre quem assumiu.
**Classificação:** 🟡 **IMPORTANTE**

---

### S22 — Upload de foto nas tasks
**Pré:** template com ao menos 1 task `requires_photo=true`. Execução em andamento.
**Passos:**
1. Abrir execução → task com câmera.
2. Tirar/anexar foto → confirmar.
**Esperado:**
- Foto subida pro storage (bucket photos, s55).
- Task marcada como `done` com `photo_url`.
**Impacto se falhar:** evidência de recebimento perdida.
**Classificação:** 🟡 **IMPORTANTE**

---

## PAPEL: MANAGER

### M23 — Evidências no histórico
**Pré:** ao menos 2 execuções de recebimento concluídas no dia.
**Passos:**
1. Login manager → `/relatorios` (ou tela de histórico relevante).
2. Filtrar por dia atual.
**Esperado:**
- Execuções aparecem com nome, fornecedor (se exposto), tasks concluídas, fotos.
- `source_template_id` permite rastrear o modelo de origem (se a UI expõe).
**Impacto se falhar:** auditoria do dia perdida.
**Classificação:** 🟡 **IMPORTANTE**

---

### M25 — Dashboard continua consistente
**Pré:** baseline pré-Etapa-3 anotada (counts do dia anterior).
**Passos:**
1. `/admin` ou `/dashboard` como manager.
2. Verificar métricas operacionais (rotinas concluídas, em andamento, etc.).
**Esperado:**
- Métricas seguem `OPERATIONAL_PREDICATE` — receivings recurring legacy estavam excluídos historicamente.
- Receivings instanciados (`is_one_shot=true`) entram nos contadores como execuções normais (Sprint 54 já cobria isso).
- Nenhuma queda abrupta de métrica.
**Impacto se falhar:** dashboard mente sobre operação.
**Classificação:** 🔴 **CRÍTICO**

---

### M26 — Relatórios continuam consistentes
**Pré:** baseline.
**Passos:**
1. `/relatorios` em diversos cortes.
2. Conferir relatórios de execução por colaborador, por área, por período.
**Esperado:**
- Receivings concluídos aparecem nas listas.
- Nenhum filtro `active=true` em `checklists` esconde execuções one-shot arquivadas (Sprint 54 cobre).
- Histórico das 7 assumptions legacy preservadas ainda acessível.
**Impacto se falhar:** auditoria histórica corrompida.
**Classificação:** 🔴 **CRÍTICO**

---

## PAPEL: OWNER

### O24 — Multi-tenant (cross-tenant isolation)
**Pré:** 2 restaurantes (`A` = `cfd6f6ab…` com templates, `B` = outro tenant sem templates).
**Passos:**
1. Login owner em restaurante A → ver templates + suppliers.
2. Trocar para restaurante B.
3. Verificar `/turno`, `/configuracoes?tab=fornecedores`, e tentar via API:
   ```
   curl /api/receiving-templates?restaurant_id=<id_de_A> com token de B
   ```
**Esperado:**
- Token de B não retorna dados de A em nenhuma rota.
- RLS bloqueia leitura cruzada.
- Templates, suppliers, execuções isolados por `restaurant_id`.
**Impacto se falhar:** vazamento entre tenants — bug de segurança grave.
**Classificação:** 🔴 **CRÍTICO**

---

### O27 — Fluxos antigos de rotina continuam funcionando
**Pré:** rotinas regulares (`checklist_type='regular'`) ativas no restaurante.
**Passos:**
1. Owner → `/turno` → tab "Rotinas" ou "Todas".
2. Assumir 1 rotina, executar tasks, concluir.
3. Verificar dashboard, my-activities badge, relatórios.
4. Confirmar que tela `/admin/recebimentos` legacy ainda abre sem erros (mesmo que vazia/quase-vazia).
**Esperado:**
- Rotinas regulares 100% inalteradas.
- `/admin/recebimentos` carrega; pode mostrar as 17 expectations pre-existentes (read-only OK).
- Materialização legacy lazy continua funcionando para os 0 templates restantes — sem efeito prático mas sem erro.
**Impacto se falhar:** regressão em features fora do escopo deste refator.
**Classificação:** 🔴 **CRÍTICO**

---

## Tabela consolidada (27 cenários classificados)

| # | Cenário | Papel | Classificação | Obrigatório p/ merge? |
|---|---|---|---|---|
| S1 | Área sem modelos | Staff | 🔴 Crítico | **SIM** |
| S2 | Área com modelos disponíveis | Staff | 🔴 Crítico | **SIM** |
| S3 | Área com modelos indisponíveis no dia | Staff | 🟡 Importante | Recomendado |
| S4 | Modelo por área | Staff | 🔴 Crítico | **SIM** |
| S5 | Modelo por role | Staff | 🟡 Importante | Recomendado |
| S6 | Modelo por usuário | Staff | 🟡 Importante | Recomendado |
| S7 | Fornecedor existente | Staff | 🔴 Crítico | **SIM** |
| S8 | Cadastro inline de fornecedor | Staff | 🔴 Crítico | **SIM** |
| S9 | Instanciação (fluxo feliz) | Staff | 🔴 Crítico | **SIM** |
| S10 | Duplo clique (idempotência) | Staff | 🔴 Crítico | **SIM** |
| S11 | Refresh durante instanciação | Staff | 🟡 Importante | Recomendado |
| S12 | N execuções/dia do mesmo modelo | Staff | 🔴 Crítico | **SIM** |
| S13 | Aparece em "Executando" | Staff | 🔴 Crítico | **SIM** |
| S14 | Aparece em "Recebimentos" | Staff | 🟡 Importante | Recomendado |
| S15 | Aparece em "Todas" | Staff | 🟡 Importante | Recomendado |
| S16 | Modelo NÃO aparece na lista | Staff | 🔴 Crítico | **SIM** |
| S17 | Conclusão | Staff | 🔴 Crítico | **SIM** |
| S18 | Executando → Concluído | Staff | 🔴 Crítico | **SIM** |
| S19 | Contadores | Staff | 🟡 Importante | Recomendado |
| S20 | Filtros | Staff | 🟡 Importante | Recomendado |
| S21 | Navegação direta | Staff | 🟡 Importante | Recomendado |
| S22 | Upload de foto | Staff | 🟡 Importante | Recomendado |
| M23 | Evidências no histórico | Manager | 🟡 Importante | Recomendado |
| O24 | Multi-tenant | Owner | 🔴 Crítico | **SIM** |
| M25 | Dashboard consistente | Manager | 🔴 Crítico | **SIM** |
| M26 | Relatórios consistentes | Manager | 🔴 Crítico | **SIM** |
| O27 | Rotinas antigas funcionam | Owner | 🔴 Crítico | **SIM** |

---

## Cenários obrigatórios para aprovar PR #11

**14 críticos:** S1, S2, S4, S7, S8, S9, S10, S12, S13, S16, S17, S18, O24, M25, M26, O27.

> Se qualquer um dos críticos falhar: PR fica bloqueada até correção. Os "Importantes" e "Complementares" podem ser ressalvas conhecidas com plano de follow-up.

---

## Roteiro mínimo (caminho rápido para aprovação)

Se houver pressa, execute na seguinte ordem o caminho crítico em ~30 minutos:

1. **Setup** (5 min) — criar 1 supplier, confirmar templates existentes.
2. **S2 + S9** — fluxo feliz: ver botão → criar → execução criada.
3. **S7 + S8** — supplier existente e inline.
4. **S10** — duplo clique.
5. **S12** — N execuções/dia.
6. **S13 + S18** — executando → concluído.
7. **S16** — modelo não polui lista.
8. **S1 + S4** — área sem modelo e isolamento por área.
9. **O24** — cross-tenant.
10. **M25 + M26** — dashboard e relatórios.
11. **O27** — rotinas antigas.

Tempo estimado: 30-45 minutos por testador.

---

## Em caso de falha

| Tipo | Ação |
|---|---|
| Crítico falha | Bloqueia PR. Abrir issue, marcar como blocker, voltar à branch para fix. |
| Importante falha | Documentar como known-issue na PR; decidir caso-a-caso se bloqueia. |
| Complementar falha | Logar para backlog; não bloqueia. |

---

## Anexos sugeridos durante a homologação

- Screenshot do bloco "Executando" no mobile.
- Print do modal step 1 e step 2.
- SQL de validação: count execuções por template no dia, count templates ativos, count suppliers.
- Confirmação de baseline (counts dashboard/relatórios) antes do início.
