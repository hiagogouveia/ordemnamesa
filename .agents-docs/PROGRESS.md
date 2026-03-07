# PROGRESS.md

## Sprint atual: S6 — Turnos, Funções e Compras (em andamento)
Ambiente: develop → Supabase NONPROD
Branch: develop (1 commit à frente do origin — fazer push antes de continuar)

## Mapa de arquivos existentes (atualizar a cada sprint)
app/(auth)/login/                  → tela de login
app/(app)/layout.tsx               → sidebar + header (CUIDADO: afeta todas as páginas)
app/(app)/selecionar-restaurante/  → seleção multi-tenant
app/(app)/dashboard/               → dados reais do banco ✅ (S5)
app/(app)/checklists/              → CRUD completo ✅
app/(app)/turno/                   → execução STAFF ✅ (tasks concluídas somem imediatamente)
app/(app)/historico/               → histórico colaborador ✅
app/api/checklists/                → GET, POST, PUT, DELETE ✅
app/api/execucoes/                 → GET, POST, DELETE ✅
app/api/dashboard/                 → GET métricas reais ✅ (S5)
app/api/shifts/                    → GET, POST ✅ (S6)
app/api/shifts/[id]/               → PUT, DELETE soft ✅ (S6)
app/api/roles/                     → GET, POST ✅ (S6)
app/api/roles/[id]/                → PUT ✅ (S6)
app/api/user-roles/                → GET (?user_id / ?role_id), POST (guard UNIQUE) ✅ (S6)
app/api/user-roles/[id]/           → DELETE ✅ (S6)
app/api/user-shifts/               → GET (?user_id), POST ✅ (S6)
app/api/user-shifts/[id]/          → DELETE ✅ (S6)
app/api/purchase-lists/            → GET (?status), POST (verifica can_launch_purchases) ✅ (S6)
app/api/purchase-lists/[id]/       → GET (detalhes + items) ✅ (S7), PUT (fecha com closed_at) ✅ (S6)
app/api/equipe/[id]/               → PUT (atualiza users.name) ✅ (S7)
app/api/purchase-items/            → POST ✅ (S6)
app/api/purchase-items/[id]/       → PUT (checked_by/checked_at automático) ✅ (S6)
app/api/task-executions/[id]/assume/ → POST (limite max_concurrent_tasks, 409) ✅ (S6)
lib/store/restaurant-store         → Zustand: restaurantId, userRole
lib/hooks/use-checklists           → React Query ✅
lib/hooks/use-execucoes            → React Query ✅
lib/hooks/use-dashboard            → React Query ✅ (S5)
lib/types/index.ts                 → tipos compartilhados
supabase/migrations/               → 20260306_s6_shifts_roles_purchases.sql ✅ (S6, aplicado NONPROD)

## Schema S6 — novas tabelas (já aplicadas no NONPROD)
shifts          → turnos do restaurante (soft delete: active=false)
roles           → funções/áreas (ex: cozinha, bar) com max_concurrent_tasks
user_roles      → pivot user ↔ role (UNIQUE restaurant_id+user_id+role_id)
user_shifts     → pivot user ↔ shift
purchase_lists  → listas de compra (status: open/closed)
purchase_items  → itens da lista (checked, has_problem)

Alterações em tabelas existentes:
checklist_tasks  + assigned_to_user_id, role_id, checklist_type ('regular'|'opening'|'closing'|'receiving')
task_executions  + started_at | status agora inclui 'doing'

## Concluído
S1 ✅ Setup + Schema + CI/CD
S2 ✅ Auth + Multi-tenant + RBAC
S3 ✅ CRUD Checklists
S4 ✅ Execução STAFF mobile + upload foto
S5 ✅ Dashboard Manager com dados reais + Fixes críticos
   - Tasks concluídas somem da lista do turno imediatamente
   - Dashboard com métricas reais (conclusão, alertas, equipe, progresso)
   - Sem flash do dashboard ao logar como staff
   - Modal "Reportar Problema" funcional com status=flagged
   - Botão "Nova Lista" visível no mobile
S6 — Parte 1 ✅ Migration SQL (shifts, roles, user_roles, user_shifts, purchase_lists, purchase_items)
S6 — Parte 2 ✅ APIs (13 route handlers, tsc limpo, commit 42683ab)

## S7 — Bugs e Melhorias ✅ (em andamento)

### Migration aplicada (NONPROD)
supabase/migrations/20260307_s7_bugs_improvements.sql
- roles: ADD COLUMN active boolean NOT NULL DEFAULT true
- checklists: ADD COLUMN recurrence text, ADD COLUMN last_reset_at

### BUG 1 ✅ — Funções/Áreas não apareciam após salvar
Causa: tabela `roles` não tinha coluna `active`. `roles.filter(r => r.active)` retornava vazio.
Fix: migration adicionou coluna com DEFAULT true.

### BUG 2 ✅ — Compras: "Lista não encontrada" ao clicar
Causa: GET `/api/purchase-lists/[id]` não existia, só PUT.
Fix: adicionado GET handler em `app/api/purchase-lists/[id]/route.ts`.

### BUG 3 ✅ — Filtro de áreas no checklist não funcionava
Causa: filtros hardcoded por `c.category`, ignorando `role_id`.
Fix: `checklist-list.tsx` usa `useRoles` para chips dinâmicos, filtra por `c.role_id`.

### BUG 4 ✅ — Campo "Categoria Antiga" removido do checklist
Substituído pelo campo "Repetição" (recorrência) no mesmo grid.
Per-task assignment já existia em `task-item.tsx`.

### MELHORIA 1 ✅ — Campo nome na tela de Equipe
- `app/api/equipe/[id]/route.ts`: PUT → UPDATE users SET name
- `lib/hooks/use-equipe.ts`: adicionado `useUpdateEquipeName`
- `team-drawer.tsx`: nome editável inline com hover reveal
- `equipe/page.tsx`: modal "Novo Colaborador" com campos name + email + cargo

### MELHORIA 2 ✅ — Áreas e Turnos no drawer (já estava implementado)

### MELHORIA 3 ✅ — Recorrência no checklist
- Migration: recurrence + last_reset_at
- `lib/types/index.ts`: Checklist type atualizado
- `checklist-form.tsx`: select "Repetição" (none/daily/weekdays/weekly/monthly/yearly)
- `app/api/tasks/kanban/route.ts`: reset automático por ciclo + enriquece tasks com is_required

### MELHORIA 4 ✅ — Obrigatório no kanban
- Kanban API retorna is_required por task (join com checklist)
- Tasks obrigatórias ordenadas primeiro
- Badge "⚡ Obrigatório" com borda primary
- Banner verde "Todas as tarefas obrigatórias concluídas!" quando todas done

### MELHORIA 5 ✅ — Banner sem área no staff
- Banner amarelo "Você não tem área atribuída" quando userRoles.length === 0
- Tarefas sem role_id (genéricas) ainda são exibidas

### Build
tsc --noEmit: ✅ sem erros

---

## S7 — Rodada 2 ✅ (commit 4415ed0)

### BUG 1 ✅ — Cadastro de colaborador funcional
- `POST /api/equipe`: usa `supabaseAdmin.auth.admin.createUser({ email_confirm: true, password })`
- Cria usuário no Auth sem confirmação de e-mail, com senha definida pelo admin
- Insere em `restaurant_users` com role selecionado
- Modal "Novo Colaborador": nome, e-mail, senha (show/hide), cargo, áreas (chips), turno (select)
- Após criar: atribui áreas via `/api/user-roles` e turno via `/api/user-shifts`

### BUG 2 ✅ — Modal único de edição
- `team-drawer.tsx` convertido de drawer lateral para modal centralizado (max-w-lg, scroll)
- Tanto o lápis quanto o click na linha abrem o mesmo modal
- Modal com: nome, cargo, status toggle, áreas (chips inline), turnos (chips inline)
- Removido modal separado de "Alterar Cargo"

### BUG 3 ✅ — Nome atualiza sem fechar e reabrir
- `PUT /api/equipe/[id]` agora aceita `{ name, role, active, restaurant_id }` — atualiza tudo junto
- Após salvar: `queryClient.setQueryData` atualiza cache local + `setSelectedMember` reflete no modal
- Sem `router.refresh()` nem fechar/reabrir

### BUG 4 ✅ — Staff vê tarefas (raiz era BUG 1)
- Com BUG 1 corrigido, staff é criado corretamente no Auth e public.users
- Kanban já exibia tarefas genéricas (role_id IS NULL) para todos
- Banner "Você não tem área atribuída" já implementado (S7 anterior)

### MELHORIA 1 ✅ — Enter para adicionar próxima tarefa
- `task-item.tsx`: input de título com `onKeyDown Enter → onEnter?.()`
- `checklist-form.tsx`: `useRef` de inputs, `addTask(afterTempId)` insere após o índice e foca

### MELHORIA 2 ✅ — Atribuir rotina inteira a colaborador
- Migration: `checklists.assigned_to_user_id uuid REFERENCES users(id)` (NONPROD aplicado)
- `lib/types/index.ts`: campo adicionado ao tipo `Checklist`
- `checklist-form.tsx`: select "Atribuir a colaborador específico" após Área
- `kanban/route.ts`: checklists filtrados por `.or('assigned_to_user_id.is.null,assigned_to_user_id.eq.${user.id}')`

### Arquivos modificados
app/api/equipe/route.ts          → POST handler completo
app/api/equipe/[id]/route.ts     → PUT estendido (name + role + active)
app/(app)/equipe/_components/team-drawer.tsx → modal centralizado
app/(app)/equipe/page.tsx        → modais unificados, novo colaborador
components/checklists/task-item.tsx  → props onEnter + setInputRef
components/checklists/checklist-form.tsx → refs, addTask(after), assigned_to_user_id
app/api/tasks/kanban/route.ts    → filtro assigned_to_user_id
lib/types/index.ts               → assigned_to_user_id em Checklist
supabase/migrations/20260307_s7_bugs_improvements.sql → coluna adicionada

### Build
tsc --noEmit: ✅ sem erros

---

## S6 — CONCLUÍDA ✅ (commit 963ad0a)

### Telas Admin
app/(app)/configuracoes/    → gestão de turnos e funções/roles ✅
app/(app)/compras/          → listagem de listas de compra ✅
app/(app)/compras/[id]/     → detalhe da lista com itens ✅

### Telas Staff
app/(app)/turno/            → kanban de tarefas (Para Fazer / Fazendo / Concluídas) ✅
app/(app)/recebimento/[id]/ → conferência de itens recebidos ✅

### Checklists avançados
checklist_type: regular | opening | closing | receiving (badge visual por tipo)
role_id no checklist: select de Área/Role com dot colorido
is_required: toggle obrigatório
Task: assigned_to_user_id (select de colaborador específico)
Redirecionamento para /compras?new=true ao criar checklist tipo Recebimento

### Navegação
Sidebar: "Compras" visível para owner/manager
Sidebar: "Compras" visível para staff com can_launch_purchases=true em qualquer role

### Hooks React Query (lib/hooks/)
use-roles.ts, use-shifts.ts, use-purchases.ts, use-tasks.ts
use-user-roles-shifts.ts, use-equipe.ts (atualizado)

### Build
tsc --noEmit: ✅ sem erros
npm run build: ✅ 37 páginas geradas sem erros

---
**Como usar:** ler CONTEXT.md + PROGRESS.md antes de cada sessão.