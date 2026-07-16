#!/bin/bash
# db-dump-schema.sh — regenera o snapshot de DR do schema (supabase/schema.sql).
#
# Roda o `supabase db dump` oficial (via npx; usa Docker) contra o banco indicado.
# Fonte canônica: NONPROD (tem sempre o schema mais novo; PROD converge no cutover).
#
# Uso:
#   SUPABASE_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
#     ./infra/scripts/db-dump-schema.sh
#   # ou: ./infra/scripts/db-dump-schema.sh "postgresql://..."
#
# Notas:
#   - Use a URI do SESSION POOLER (porta 5432). A conexão direta (db.<ref>.supabase.co)
#     é IPv6-only e falha em redes IPv4.
#   - Roda de um diretório temporário: o CLI do Supabase tenta parsear os .env do cwd
#     e engasga com o .env.local deste projeto.
#   - O dump NÃO inclui o schema `storage` (gerenciado). O bucket de fotos + policies
#     vivem em supabase/schema-storage.sql — se mudar algo de storage, atualize-o também.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="${1:-${SUPABASE_DB_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo "ERRO: passe a URL do banco (arg ou env SUPABASE_DB_URL)." >&2
  echo "  Ex.: postgresql://postgres.<ref>:<senha>@aws-1-us-east-1.pooler.supabase.com:5432/postgres" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERRO: Docker precisa estar rodando (o supabase db dump usa um container do pg_dump)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

echo "Gerando dump do schema..."
npx --yes supabase@latest db dump --db-url "$DB_URL" -f "$REPO_ROOT/supabase/schema.sql"

echo "OK: $(wc -l < "$REPO_ROOT/supabase/schema.sql") linhas em supabase/schema.sql"
echo "Lembrete: storage (bucket + policies) vive em supabase/schema-storage.sql."
