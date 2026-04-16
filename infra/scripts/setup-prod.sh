#!/bin/bash
# setup-prod.sh — Configuração idempotente da VPS de PRODUÇÃO
# Host: 187.127.3.104 (Hostinger)
# Usuário: root
#
# Uso:
#   ssh root@187.127.3.104 'bash -s' < infra/scripts/setup-prod.sh
#
# Idempotente: pode ser executado múltiplas vezes sem quebrar.

set -euo pipefail

LOG_FILE="/var/log/setup-ordemnamesa-prod.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Iniciando configuração da VPS PROD Ordem na Mesa..."

# --- Sistema ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  unzip \
  htop \
  git \
  jq

# --- Docker (idempotente) ---
if ! command -v docker &>/dev/null; then
  echo "[$(date)] Instalando Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  echo "[$(date)] Docker instalado: $(docker --version)"
else
  echo "[$(date)] Docker já instalado: $(docker --version)"
fi

# --- Diretórios da aplicação ---
echo "[$(date)] Criando estrutura de diretórios..."

APP_DIR="/opt/ordemnamesa-prod"

mkdir -p "${APP_DIR}/traefik"
mkdir -p "${APP_DIR}/data"

# acme.json para Traefik (certificados Let's Encrypt)
touch "${APP_DIR}/traefik/acme.json"
chmod 600 "${APP_DIR}/traefik/acme.json"

echo "[$(date)] Configuração concluída com sucesso."
echo "[$(date)] Docker versão: $(docker --version)"
echo "[$(date)] Docker Compose versão: $(docker compose version)"
echo ""
echo "=========================================="
echo "  PRÓXIMOS PASSOS:"
echo "=========================================="
echo "  1. Copiar docker-compose.prod.yml para ${APP_DIR}/docker-compose.yml"
echo "  2. Copiar traefik.prod.yml para ${APP_DIR}/traefik/traefik.yml"
echo "  3. Copiar routes.prod.yml para ${APP_DIR}/traefik/routes.yml"
echo "  4. Criar .env com as variáveis de PROD"
echo "  5. docker compose up -d"
echo "=========================================="
