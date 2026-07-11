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

# --- Swap (NONPROD) ---
# Configurado ANTES do restart do Docker para não depender dele (proteção de host).
# VM micro (~1 GB RAM) sem swap → risco de OOM. Cria 2 GB idempotentemente.
if ! swapon --show | grep -q '/swapfile'; then
  echo "[$(date)] Criando swap de 2 GB..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -w vm.swappiness=10
else
  echo "[$(date)] Swap já configurado."
fi

# --- Limite de logs de container (NONPROD) ---
# Sem isto os logs json-file crescem sem teto. Aplica-se a containers recriados
# após o restart do Docker. Idempotente (sobrescreve o arquivo).
# O '|| true' garante que uma falha transitória no restart não aborte o script
# (set -e), preservando a criação do timer logo abaixo.
echo "[$(date)] Configurando limite de logs do Docker (daemon.json)..."
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
JSON
systemctl restart docker || systemctl start docker || echo "AVISO: restart do Docker falhou; daemon.json valerá no próximo start."

# --- Timer de limpeza periódica de imagens dangling (NONPROD: 2x/semana) ---
echo "[$(date)] Instalando systemd timer de prune de imagens dangling..."
cat > /etc/systemd/system/docker-image-prune.service <<'UNIT'
[Unit]
Description=Prune de imagens Docker dangling (sem tag)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker image prune -f
UNIT
cat > /etc/systemd/system/docker-image-prune.timer <<'UNIT'
[Unit]
Description=Executa prune de imagens dangling periodicamente

[Timer]
OnCalendar=Mon,Thu 04:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now docker-image-prune.timer

echo "[$(date)] Configuração concluída com sucesso."
echo "[$(date)] Docker versão: $(docker --version)"
echo "[$(date)] Docker Compose versão: $(docker compose version)"
