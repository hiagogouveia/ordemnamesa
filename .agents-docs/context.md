# Ordem na Mesa — Contexto Rápido

## Produto
Checklists operacionais para restaurantes. STAFF executa no celular,
MANAGER/OWNER gerencia no desktop. Web-first (sem app nativo nesta fase).

## Stack (não desviar)
Next.js 14 App Router + TypeScript | Tailwind CSS v3 | React Query + Zustand
Supabase (DB + Auth + Storage + RLS) | Vercel | GitHub Actions

## Ambientes
- develop → Supabase NONPROD (mkwxulikizrfdupqpyrn.supabase.co)
- main    → Supabase PROD    (buucddacymkybkrszcqy.supabase.co)
- SERVICE_ROLE_KEY: apenas em app/api/ — NUNCA no client

## RBAC
- staff   → executa checklists no celular (390px)
- manager → dashboard + checklists + equipe no desktop
- owner   → tudo do manager + configurações + usuários

## Regras inegociáveis
1. Todo dado tem restaurant_id obrigatório
2. RLS ativa em todas as tabelas — nunca desativar
3. Seleção de restaurante: sempre manual, nunca automática
4. Remover usuário = active:false — nunca deletar fisicamente
5. Mobile-first: 390px primeiro, sempre

## Design System
bg:#101d22 | surface:#16262c | border:#233f48 | muted:#92bbc9
primary:#13b6ec | success:#22c55e | warning:#f59e0b | error:#ef4444
Fontes: Fraunces (títulos) | DM Sans (corpo) | DM Mono (dados)

## Arquivos de referência (ler só quando necessário)
- Schema completo:   .agents-docs/SCHEMA.sql
- Design completo:   .agents-docs/Master.md
- Telas de design:   .agents-docs/designer-stich.html
  (ler APENAS a seção relevante para a tarefa atual)

## Sprint atual: ver PROGRESS.md