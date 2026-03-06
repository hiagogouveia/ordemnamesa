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
app/api/purchase-lists/[id]/       → PUT (fecha com closed_at) ✅ (S6)
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

## S6 — Partes pendentes
- Parte 3: Hooks React Query para as novas entidades
- Parte 4: Páginas de UI (turnos, funções, compras)
- (histórico com filtros, notificações, relatórios exportáveis — prioridade a definir)

---
**Como usar:** ler CONTEXT.md + PROGRESS.md antes de cada sessão.