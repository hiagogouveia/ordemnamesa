#!/bin/bash
# cloud-init userdata — ordem-na-mesa-nonprod
# Executado uma vez na criação da VM como root

set -euo pipefail

LOG_FILE="/var/log/userdata-ordemnamesa.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Iniciando configuração da VM NONPROD Ordem na Mesa..."

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
  htop

# --- Docker ---
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

# Iniciar e habilitar Docker
systemctl enable docker
systemctl start docker

# Adicionar usuário ubuntu ao grupo docker
usermod -aG docker ubuntu

# --- Diretórios da aplicação ---
echo "[$(date)] Criando estrutura de diretórios..."

APP_DIR="/opt/ordemnamesa"

mkdir -p "${APP_DIR}/traefik"
mkdir -p "${APP_DIR}/data"

# acme.json para Traefik (certificados Let's Encrypt)
touch "${APP_DIR}/traefik/acme.json"
chmod 600 "${APP_DIR}/traefik/acme.json"

# Permissões para o usuário ubuntu
chown -R ubuntu:ubuntu "${APP_DIR}"

echo "[$(date)] Configuração concluída com sucesso."
echo "[$(date)] Docker versão: $(docker --version)"
echo "[$(date)] Docker Compose versão: $(docker compose version)"
