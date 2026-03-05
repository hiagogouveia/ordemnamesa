# PROGRESS.md

## Sprint atual: S5 — Dashboard do Manager
Ambiente: develop → Supabase NONPROD

## Mapa de arquivos existentes (atualizar a cada sprint)
app/(auth)/login/           → tela de login
app/(app)/layout.tsx        → sidebar + header (CUIDADO: afeta todas as páginas)
app/(app)/selecionar-restaurante/ → seleção multi-tenant
app/(app)/dashboard/        → placeholder com cards mockados
app/(app)/checklists/       → CRUD completo ✅
app/(app)/turno/            → execução STAFF ✅
app/(app)/historico/        → histórico colaborador ✅
app/api/checklists/         → GET, POST, PUT, DELETE ✅
app/api/execucoes/          → GET, POST, DELETE ✅
lib/store/restaurant-store  → Zustand: restaurantId, userRole
lib/hooks/use-checklists    → React Query ✅
lib/hooks/use-execucoes     → React Query ✅
lib/types/index.ts          → tipos compartilhados

## Concluído
S1 ✅ Setup + Schema + CI/CD
S2 ✅ Auth + Multi-tenant + RBAC
S3 ✅ CRUD Checklists
S4 ✅ Execução STAFF mobile + upload foto (Fix Bugs Navegação, RBAC e Soft Delete)

## Próximo: S5 — Dashboard Manager
- Métricas em tempo real
- Alertas de não conformidade  
- Histórico com filtros
```

---

**Como usar a partir de agora — apenas 2 arquivos por sessão:**
```
CONTEXT.md + PROGRESS.md