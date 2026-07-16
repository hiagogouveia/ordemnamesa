#!/bin/bash
# db-restore-schema.sh — aplica o snapshot de DR (schema.sql + schema-storage.sql) num
# projeto Supabase NOVO. É o passo de banco do DR: projeto novo → este script → app no ar.
#
# Uso:
#   ./infra/scripts/db-restore-schema.sh "postgresql://postgres.<ref>:<senha>@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
#
# GUARDA DE SEGURANÇA: recusa rodar se o banco alvo JÁ TIVER tabelas no schema public.
# Este script é para reconstruir um banco VAZIO — nunca para "sincronizar" um banco vivo
# (aplicar o snapshot por cima de dados reais causaria erros e, pior, poderia mascarar
# divergências). Não há override por flag de propósito: se o alvo não está vazio, a
# decisão de prosseguir precisa ser humana e manual (psql).
#
# Requisitos: Docker rodando (usa a imagem postgres para o psql).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="${1:-}"

if [ -z "$DB_URL" ]; then
  echo "ERRO: passe a URL do banco ALVO (session pooler, porta 5432)." >&2
  exit 1
fi

for f in "$REPO_ROOT/supabase/schema.sql" "$REPO_ROOT/supabase/schema-storage.sql"; do
  [ -f "$f" ] || { echo "ERRO: $f não existe." >&2; exit 1; }
done

if ! docker info >/dev/null 2>&1; then
  echo "ERRO: Docker precisa estar rodando." >&2
  exit 1
fi

PSQL() {
  docker run --rm -i -v "$REPO_ROOT/supabase:/snapshot:ro" postgres:17-alpine \
    psql "$DB_URL" -v ON_ERROR_STOP=1 "$@"
}

# ── Guarda: o alvo precisa estar VAZIO ─────────────────────────────────────────
TABLES=$(docker run --rm postgres:17-alpine psql "$DB_URL" -tAc \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
if [ "$TABLES" != "0" ]; then
  echo "ERRO: o banco alvo já tem ${TABLES} tabela(s) no schema public — NÃO é um banco vazio." >&2
  echo "Este script só reconstrói bancos NOVOS. Abortando sem tocar em nada." >&2
  exit 1
fi

echo "Alvo vazio confirmado. Aplicando supabase/schema.sql..."
PSQL -f /snapshot/schema.sql

echo "Aplicando supabase/schema-storage.sql (bucket + RLS de storage)..."
PSQL -f /snapshot/schema-storage.sql

echo ""
echo "Restore concluído. Verificação rápida:"
docker run --rm postgres:17-alpine psql "$DB_URL" -tAc \
  "select 'tabelas: '||count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
   union all select 'policies: '||count(*) from pg_policies where schemaname='public'
   union all select 'funcoes: '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
echo "(esperado: ~47 tabelas, ~73 policies, ~27 funções)"
