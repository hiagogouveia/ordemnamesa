# PROGRESS.md

## Sprint atual: S5 — Dashboard do Manager
Ambiente: develop → Supabase NONPROD

## Mapa de arquivos existentes (atualizar a cada sprint)
app/(auth)/login/           → tela de login
app/(app)/layout.tsx        → sidebar + header (CUIDADO: afeta todas as páginas)
app/(app)/selecionar-restaurante/ → seleção multi-tenant
app/(app)/dashboard/        → dados reais do banco ✅ (S5)
app/(app)/checklists/       → CRUD completo ✅
app/(app)/turno/            → execução STAFF ✅ (tasks concluídas somem imediatamente)
app/(app)/historico/        → histórico colaborador ✅
app/api/checklists/         → GET, POST, PUT, DELETE ✅
app/api/execucoes/          → GET, POST, DELETE ✅
app/api/dashboard/          → GET métricas reais ✅ (S5 novo)
lib/store/restaurant-store  → Zustand: restaurantId, userRole
lib/hooks/use-checklists    → React Query ✅
lib/hooks/use-execucoes     → React Query ✅
lib/hooks/use-dashboard     → React Query ✅ (S5 novo)
lib/types/index.ts          → tipos compartilhados

## Concluído
S1 ✅ Setup + Schema + CI/CD
S2 ✅ Auth + Multi-tenant + RBAC
S3 ✅ CRUD Checklists
S4 ✅ Execução STAFF mobile + upload foto
S5 ✅ Dashboard Manager com dados reais + Fixes críticos
   - Bug 1: Tasks concluídas somem da lista do turno imediatamente
   - Bug 2: Dashboard com métricas reais (conclusão, alertas, equipe, progresso)
   - Bug 3: Sem flash do dashboard ao logar como staff
   - Bug 4: Modal de "Reportar Problema" funcional com status=flagged
   - Bug 5: Botão "Nova Lista" visível no mobile

## Próximo: S6
- Histórico com filtros avançados por data e colaborador
- Notificações de alertas em tempo real
- Relatórios exportáveis
```

---

**Como usar a partir de agora — apenas 2 arquivos por sessão:**
```
CONTEXT.md + PROGRESS.md