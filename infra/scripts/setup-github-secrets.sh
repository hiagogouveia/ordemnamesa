#!/bin/bash
# Cadastra todos os secrets NONPROD no GitHub Actions
# Repositório: hiagogouveia/ordemnamesa
#
# Pré-requisito: GitHub CLI instalado e autenticado
#   brew install gh
#   gh auth login
#
# Uso:
#   chmod +x infra/scripts/setup-github-secrets.sh
#   ./infra/scripts/setup-github-secrets.sh

set -euo pipefail

REPO="hiagogouveia/ordemnamesa"
ENV_LOCAL="$(git rev-parse --show-toplevel)/.env.local"
OCI_CONFIG="$HOME/.oci/config"
OCI_KEY="$HOME/.oci/oci_api_key.pem"
SSH_KEY="$HOME/.ssh/ordem-na-mesa-nonprod.pem"
S3_CREDS="$HOME/.oci/ordem-na-mesa-nonprod-s3-creds"

if ! command -v gh &>/dev/null; then
  echo "Erro: GitHub CLI não instalado."
  echo "Instale com: brew install gh && gh auth login"
  exit 1
fi

set_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✓ $name"
}

get_env() {
  grep "^$1=" "$2" | head -1 | cut -d'=' -f2-
}

get_oci_cfg() {
  grep "^$1=" "$OCI_CONFIG" | head -1 | awk -F= '{print $2}' | xargs
}

get_s3() {
  grep "^$1=" "$S3_CREDS" | head -1 | cut -d'=' -f2-
}

echo "==> Criando environment 'nonprod'..."
gh api "repos/$REPO/environments/nonprod" --method PUT --silent && echo "  ✓ environment nonprod criado"

echo ""
echo "==> Cadastrando secrets..."
echo ""

# --- VM ---
set_secret "VM_HOST"            "147.15.27.144"
set_secret "VM_SSH_PRIVATE_KEY" "$(cat "$SSH_KEY")"

# --- OCI Auth (Terraform) ---
set_secret "OCI_TENANCY_OCID"  "$(get_oci_cfg tenancy)"
set_secret "OCI_USER_OCID"     "$(get_oci_cfg user)"
set_secret "OCI_FINGERPRINT"   "$(get_oci_cfg fingerprint)"
set_secret "OCI_PRIVATE_KEY"   "$(cat "$OCI_KEY")"

# --- OCI Object Storage (Terraform backend) ---
set_secret "OCI_OBJECT_STORAGE_ACCESS_KEY" "$(get_s3 OCI_OBJECT_STORAGE_ACCESS_KEY)"
set_secret "OCI_OBJECT_STORAGE_SECRET_KEY" "$(get_s3 OCI_OBJECT_STORAGE_SECRET_KEY)"
set_secret "OCI_OBJECT_STORAGE_NAMESPACE"  "$(get_s3 OCI_OBJECT_STORAGE_NAMESPACE)"

# --- Supabase ---
set_secret "NEXT_PUBLIC_SUPABASE_URL"      "$(get_env NEXT_PUBLIC_SUPABASE_URL "$ENV_LOCAL")"
set_secret "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$(get_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$ENV_LOCAL")"
set_secret "SUPABASE_SERVICE_ROLE_KEY"     "$(get_env SUPABASE_SERVICE_ROLE_KEY "$ENV_LOCAL")"

# --- Resend ---
set_secret "RESEND_API_KEY" "$(get_env RESEND_API_KEY "$ENV_LOCAL")"

echo ""
echo "==> Secrets cadastrados com sucesso:"
gh secret list --repo "$REPO"
