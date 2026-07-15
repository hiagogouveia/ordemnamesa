#!/bin/bash
# provision.sh — provisionamento ÚNICO e idempotente de uma VM (PROD e NONPROD).
#
# Antes havia TRÊS verdades divergentes: userdata.sh (nonprod, cloud-init) tinha swap +
# limite de log; setup-prod.sh era CÓDIGO MORTO; e o infra-prod.yml provisionava o PROD
# inline, com método de Docker DIFERENTE e SEM swap nem limite de log. O resultado: PROD
# rodando sem swap (risco de OOM) e com log json-file ilimitado (o disco enchia).
#
# Agora um script só, parametrizado por ENV VARS (com defaults). Os dois caminhos o chamam:
#   - NONPROD: cloud-init (Terraform) injeta os params + este script (userdata.sh.tftpl).
#   - PROD:    infra-prod.yml faz scp deste script e o roda por SSH com os params de prod.
#
# Parâmetros (env vars):
#   APP_USER            usuário não-root p/ o grupo docker + dono do APP_DIR. "root" = pula.
#   APP_DIR             diretório da app (default /opt/ordemnamesa).
#   ENABLE_SWAP         "true" cria swapfile (default true — PROD ganha paridade com NONPROD).
#   SWAP_SIZE           tamanho do swap (default 2G).
#   PRUNE_SCHEDULE      OnCalendar do timer de prune (default "Mon,Thu 04:00").
#   DOCKER_LOG_MAX_SIZE / DOCKER_LOG_MAX_FILE   teto do log json-file (default 10m / 3).
#
# Idempotente: rodar de novo não quebra nada e só reinicia o Docker se o daemon.json mudar.

set -euo pipefail

APP_USER="${APP_USER:-root}"
APP_DIR="${APP_DIR:-/opt/ordemnamesa}"
ENABLE_SWAP="${ENABLE_SWAP:-true}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
PRUNE_SCHEDULE="${PRUNE_SCHEDULE:-Mon,Thu 04:00}"
DOCKER_LOG_MAX_SIZE="${DOCKER_LOG_MAX_SIZE:-10m}"
DOCKER_LOG_MAX_FILE="${DOCKER_LOG_MAX_FILE:-3}"

LOG_FILE="/var/log/provision-ordemnamesa.log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "[$(date)] provision.sh — APP_DIR=${APP_DIR} APP_USER=${APP_USER} swap=${ENABLE_SWAP} prune='${PRUNE_SCHEDULE}'"

export DEBIAN_FRONTEND=noninteractive

# --- Locks do apt (VPS pré-existente pode ter unattended-upgrades ativo) -------
systemctl stop unattended-upgrades 2>/dev/null || true
systemctl stop apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
for i in $(seq 1 30); do
  fuser /var/lib/apt/lists/lock /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock 2>/dev/null || break
  echo "aguardando lock do apt (${i}/30)..."
  sleep 3
done

# --- Dependências de sistema ---------------------------------------------------
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release unzip htop git jq

# --- Docker (método ÚNICO: repositório apt oficial, idempotente) ---------------
if ! command -v docker &>/dev/null; then
  echo "[$(date)] instalando Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
else
  echo "[$(date)] Docker já instalado: $(docker --version)"
fi

# Usuário não-root no grupo docker (nonprod usa 'ubuntu'; prod roda como root → pula).
if [ "${APP_USER}" != "root" ]; then
  usermod -aG docker "${APP_USER}" || true
fi

# --- Diretórios da aplicação ---------------------------------------------------
mkdir -p "${APP_DIR}/traefik" "${APP_DIR}/data"
touch "${APP_DIR}/traefik/acme.json"
chmod 600 "${APP_DIR}/traefik/acme.json"
if [ "${APP_USER}" != "root" ]; then
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi

# --- Swap (paridade PROD/NONPROD; VM ~1 GB sem swap = risco de OOM) -------------
if [ "${ENABLE_SWAP}" = "true" ]; then
  if ! swapon --show | grep -q '/swapfile'; then
    echo "[$(date)] criando swap de ${SWAP_SIZE}..."
    fallocate -l "${SWAP_SIZE}" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -w vm.swappiness=10
  else
    echo "[$(date)] swap já configurado."
  fi
fi

# --- Limite de logs de container (json-file cresce sem teto por padrão) ---------
# Só reinicia o Docker se o daemon.json REALMENTE mudar — re-run não derruba containers à toa.
mkdir -p /etc/docker
NEW_DAEMON_JSON=$(cat <<JSON
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "${DOCKER_LOG_MAX_SIZE}",
    "max-file": "${DOCKER_LOG_MAX_FILE}"
  }
}
JSON
)
if [ ! -f /etc/docker/daemon.json ] || [ "$(cat /etc/docker/daemon.json)" != "${NEW_DAEMON_JSON}" ]; then
  echo "[$(date)] atualizando /etc/docker/daemon.json (log caps) e reiniciando Docker..."
  echo "${NEW_DAEMON_JSON}" > /etc/docker/daemon.json
  systemctl restart docker || systemctl start docker || echo "AVISO: restart do Docker falhou; daemon.json valerá no próximo start."
else
  echo "[$(date)] daemon.json inalterado — sem restart do Docker."
fi

# --- Timer de prune de imagens dangling (cadência parametrizável) --------------
cat > /etc/systemd/system/docker-image-prune.service <<'UNIT'
[Unit]
Description=Prune de imagens Docker dangling (sem tag)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker image prune -f
UNIT
cat > /etc/systemd/system/docker-image-prune.timer <<UNIT
[Unit]
Description=Executa prune de imagens dangling periodicamente

[Timer]
OnCalendar=${PRUNE_SCHEDULE}
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now docker-image-prune.timer

echo "[$(date)] provisionamento concluído."
echo "[$(date)] Docker: $(docker --version) | Compose: $(docker compose version)"
