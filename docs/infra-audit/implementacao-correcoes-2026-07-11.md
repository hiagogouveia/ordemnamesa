# Registro de Implementação — Correções de Infra Docker/Deploy

**Data:** 2026-07-11
**Escopo:** Implementação das correções aprovadas (auditoria → revisão → validação). Sem refatorações extras.

## Arquivos alterados (repositório)

| Arquivo | Alteração | Motivo |
|---|---|---|
| `.github/workflows/app-prod.yml` | `concurrency: {group: deploy-prod, cancel-in-progress: false}` + `docker image prune -f` após `up -d` | Serializar deploys PROD; limpar dangling só após deploy OK |
| `.github/workflows/app-nonprod.yml` | idem, `group: deploy-nonprod` | Idem para NONPROD |
| `infra/docker/Dockerfile` | `HEALTHCHECK` usa `http://127.0.0.1:3000` (era `localhost`) | Corrige falso-negativo (localhost→::1 IPv6; Next.js escuta IPv4) |
| `infra/docker/docker-compose.prod.yml` | `healthcheck.test` → `127.0.0.1` | Idem (compose sobrescreve o do Dockerfile) |
| `infra/docker/docker-compose.yml` (nonprod) | `healthcheck.test` → `127.0.0.1` | Idem |
| `infra/scripts/userdata.sh` (NONPROD) | + `daemon.json` (log max-size 10m/max-file 3) + swap 2 GB + systemd timer (Seg/Qui 04:00) | Higiene de host que faltava no NONPROD |
| `infra/scripts/setup-prod.sh` (PROD) | + systemd timer (semanal) | Defesa em profundidade além do prune inline. **Sem daemon.json/swap** (escopo PROD) |
| `infra/scripts/nonprod-reclaim-images-once.sh` (novo) | Script one-shot do reclaim | Liberar o passivo de ~31 GB uma única vez (não é rotina) |

## Aplicado ao vivo — NONPROD (`147.15.27.144`)

| Ação | Resultado |
|---|---|
| Reclaim (`docker image prune -f`) | 249→**2** imagens; 247→**0** dangling; disco **72%→13%** (~29 GB liberados) |
| daemon.json + `systemctl restart docker` | JSON válido, docker `active`. Aplica a containers recriados (próximo deploy) |
| swap 2 GB | ativo, `swappiness=10`, persistente em `/etc/fstab` |
| systemd timer | `active`, próximo disparo Seg 04:00 |
| App externo pós-restart | `https://nonprod.ordemnamesa.com.br/api/health` → **HTTP 200** |

## PROD (`187.127.3.104`)
- **Nenhuma mutação direta.** As mudanças de PROD (concurrency, prune inline, healthcheck, timer) chegam pelo pipeline: as de workflow/imagem no próximo deploy; o **timer via `setup-prod.sh`** quando o script chegar em `main` (executado idempotentemente pelo `infra-prod.yml`). Aplicação SSH ad-hoc em PROD foi deliberadamente evitada.

## Testes executados (sem deploy)
- **Fix do healthcheck comprovado:** dentro do container, `127.0.0.1:3000/api/health` → `{"status":"ok"}`; `localhost:3000` → `connection refused` (confirma o diagnóstico IPv6).
- **Reclaim seguro:** app seguiu no ar; imagens em uso e Traefik intactos; disco despencou.
- **Sintaxe:** YAML dos 4 arquivos válidos (Ruby YAML); `bash -n` OK nos 3 scripts.
- **Idempotência:** blocos de swap/daemon/timer com guardas (`grep -q`, sobrescrita controlada).

## Validações que dependem do 1º deploy NONPROD (pós commit+push em `develop`)
- Healthcheck ponta-a-ponta: container reporta `healthy` (imagem/compose novos).
- `concurrency`: dois pushes seguidos serializam.
- Prune inline: `dangling=0` ao fim do deploy.
- daemon.json efetivo: container recriado com `max-size 10m/max-file 3`.

## Riscos remanescentes
- Enquanto os workflows/imagem não forem deployados, o NONPROD roda a imagem antiga (web segue `unhealthy` por falso-negativo até o redeploy — app OK).
- Timer do PROD só ativo após `setup-prod.sh` chegar em `main`.
- daemon.json não afeta containers já rodando até serem recriados (próximo deploy).

## Oportunidades observadas (NÃO implementadas — fora de escopo)
- Arquivos duplicados em `.github/workflows/`: `photo-retention 2.yml`, `security-advisors 2.yml`, `security-tests 2.yml` (cópias " 2" acidentais). Recomenda-se remover em tarefa separada.
- Retenção de GHCR e monitoramento sintético externo permanecem pendentes (fases posteriores, conforme revisão arquitetural).
