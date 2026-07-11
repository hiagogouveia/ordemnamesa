#!/bin/bash
# nonprod-reclaim-images-once.sh — Reclaim ÚNICO do acúmulo de imagens no NONPROD.
#
# Contexto: a auditoria (docs/infra-audit/) encontrou ~247 imagens dangling / ~31 GB
# acumuladas no NONPROD (disco em 72%). Este script libera esse passivo UMA vez.
#
# NÃO é rotina automática — a limpeza contínua é feita por:
#   1) prune inline no deploy (app-nonprod.yml)
#   2) systemd timer docker-image-prune.timer (userdata.sh)
#
# Uso (uma única vez):
#   ssh -i ~/.ssh/ordem-na-mesa-nonprod.pem ubuntu@147.15.27.144 'bash -s' < infra/scripts/nonprod-reclaim-images-once.sh
#
# Seguro: remove SOMENTE imagens dangling (sem tag). Nunca toca imagem em uso,
# Traefik, volumes ou networks.

set -euo pipefail

echo "=== Estado ANTES ==="
docker system df
echo "Dangling: $(docker images -f dangling=true -q | wc -l)"
df -h /

echo "=== Reclaim (docker image prune -f) ==="
docker image prune -f

echo "=== Estado DEPOIS ==="
docker system df
echo "Dangling: $(docker images -f dangling=true -q | wc -l)"
df -h /

echo "=== Sanidade: containers no ar ==="
docker compose -f /opt/ordemnamesa/docker-compose.yml ps 2>/dev/null || docker ps
