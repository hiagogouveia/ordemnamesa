# Auditoria Técnica da Infraestrutura — Ordem na Mesa (PROD Hostinger + NONPROD OCI)

**Data:** 2026-07-11
**Alvos auditados (SSH read-only nos dois):**
- **PROD** — VPS Hostinger `187.127.3.104` / `ordemnamesa.com.br` (user `root`)
- **NONPROD** — VM OCI `147.15.27.144` / `nonprod.ordemnamesa.com` (user `ubuntu`, `VM.Standard.E2.1.Micro` Always Free)

**Natureza:** Auditoria **100% não destrutiva e somente-leitura**. Nenhuma imagem, container, volume, pacote ou serviço foi alterado, removido ou reiniciado. Todos os comandos foram informativos (`df`, `docker system df`, `docker inspect`, `systemctl list-timers`) ou simulações explícitas (`apt-get -s`). Chaves SSH efêmeras removidas ao final.
**Motivação:** Verificar se o Ordem na Mesa reproduz o problema encontrado no projeto KidPass (acúmulo de +220 imagens Docker / ~25 GB desperdiçados, sem limpeza automática nos deploys).

> **§§2–9 descrevem o ambiente PROD (Hostinger).** O ambiente **NONPROD (OCI)** é auditado na **§10**, e a comparação KidPass (§9) cobre os dois.

---

## 1. Resumo executivo

**Os dois ambientes têm a MESMA causa-raiz do KidPass (deploy sem prune de imagens), mas em estágios opostos de gravidade:**

| Ambiente | Classificação | Por quê |
|---|---|---|
| **PROD (Hostinger)** | 🟡 **ATENÇÃO** | Mesmo acúmulo, porém disco de 96 GB só 11% usado → estágio inicial, runway longo. |
| **NONPROD (OCI)** | 🔴 **CRÍTICO** | **249 imagens / 247 dangling / ~31 GB**, disco **72% (35/49 GB)** numa VM de **956 MB RAM**, **sem rotação de log de container** → aproxima-se rápido do esgotamento. |

**PROD** está **saudável em recursos** (disco 11%, RAM 15%, load ~0, uptime 85 dias, site HTTP 200) e vários mecanismos de higiene que o KidPass não tinha **estão presentes e funcionando**: rotação de logs via `logrotate`, `journald` limitado (1 GB / 7 dias) e `unattended-upgrades` habilitado. Seus dois problemas reais são: (1) acúmulo de imagens sem prune — 55 dangling, 7,2 GB em `/var/lib/containerd`, 9,76 GB reclamáveis; (2) healthcheck do web permanentemente *unhealthy* (falso-negativo).

**NONPROD** é o **gêmeo quase-completo do KidPass**: o mesmo padrão sem prune, mas com **cadência de deploy maior** (todo push em `develop`), **VM minúscula** e **sem `logrotate` para logs de container nem limites custom de `journald`** — a higiene que salva o prod **não existe aqui**. Resultado: disco em 72% e subindo. É o item que exige ação primeiro.

Detalhes, evidências e recomendações abaixo (PROD nas §§2–9; NONPROD na §10).

---

## 2. Estado atual da VPS

| Recurso | Valor | Avaliação |
|---|---|---|
| **SO** | Ubuntu 24.04.4 LTS (Noble), kernel 6.8.0-107, KVM/x86-64 | ✅ atual |
| **CPU** | 2 vCPU | ✅ ocioso (load 0.06 / 0.04 / 0.01) |
| **Memória** | 7,8 GiB total — **1,2 GiB usados**, 6,6 GiB disponíveis | ✅ folga grande |
| **Swap** | **0 B — não configurado** | ⚠️ sem rede de segurança p/ picos/OOM |
| **Disco `/`** | 96 GB total — **9,7 GB usados (11%)**, 87 GB livres | ✅ saudável |
| **Inodes `/`** | 302.412 / 12.976.128 (**3%**) | ✅ saudável |
| **Uptime** | 85 dias | ⚠️ kernel 6.8.0-134 instalado mas não ativo → reboot pendente |
| **Site** | `https://ordemnamesa.com.br` → **HTTP 200** (0,47 s) | ✅ no ar |

Processos que mais consomem: `next-server` (557 MB RSS, uid 1001), `traefik` (117 MB), `dockerd` (101 MB) — todos esperados. Também presentes: `monarx-agent` (scanner de malware da Hostinger) e `fwupd`.

---

## 3. Estado do Docker

**Versão:** Docker 29.4.0 · **Storage driver:** `overlayfs` (usa o *image store* do containerd) · **Logging driver:** `json-file` · **Docker Root Dir:** `/var/lib/docker`.

### `docker system df`
```
TYPE            TOTAL   ACTIVE   SIZE      RECLAIMABLE
Images          57      2        7.681GB   9.761GB (127%)
Containers      2       2        94.21kB   0B (0%)
Local Volumes   0       0        0B        0B
Build Cache     0       0        0B        0B
```

### Imagens — o achado central
- **57 imagens no total; apenas 2 em uso** (`prod-latest` do web + `traefik:v3.2`).
- **55 são dangling (`<none>`)** — todas versões antigas de `ghcr.io/hiagogouveia/ordem-na-mesa-web`, **uma por deploy**, da mais recente (4 dias) à mais antiga (~2 meses).
- Cada imagem web pesa ~334 MB logicamente, mas **compartilha 144,9 MB** de layers base (node:20-alpine + node_modules) — o *unique size* real por imagem é ~175–189 MB.
- **Onde o espaço realmente está:** `/var/lib/docker` mede apenas 428 MB, mas o *image store* do containerd fica em **`/var/lib/containerd` = 7,2 GB** (Docker 29 + overlayfs). É aí que os 55 layers acumulados residem. Isso concilia a divergência entre `du` e `docker system df`.

### Containers
- **2 containers, ambos rodando**, `restart: always`:
  - `ordem-na-mesa-prod-traefik` → **Up 2 meses (healthy)**.
  - `ordem-na-mesa-prod-web` → **Up 4 dias (unhealthy)** — ver §6, Problema #2.
- Nenhum container parado, antigo ou órfão.

### Volumes, networks, cache
- **Volumes:** 0 (Traefik persiste `acme.json` via bind-mount de host, não volume nomeado). Nada órfão.
- **Networks:** 4 — as 3 default (`bridge`, `host`, `none`) + `ordem-na-mesa-prod-proxy` (em uso). **Nenhuma órfã.**
- **Build cache:** **0 B** — esperado, pois o build acontece no GitHub Actions, não na VPS.

**Desperdício efetivo:** ~9,76 GB reclamáveis pelo `docker system df` (~6,5 GB físicos reais em containerd, descontando os 2 layers ativos e o compartilhamento).

---

## 4. Estado do disco

Disco de 96 GB, **9,7 GB usados (11%)**. Distribuição do consumo:

```
11G   /            (total usado ~9,7G)
├─ 8,1G  /var
│   └─ 7,9G /var/lib
│       ├─ 7,2G  /var/lib/containerd   ← layers de imagem Docker (o acúmulo)
│       ├─ 428M  /var/lib/docker       (metadados/overlays de container)
│       └─ 187M  /var/lib/apt
├─ 2,1G  /usr
├─ 163M  /var/cache
├─ 123M  /boot       (2 kernels)
└─ 76M   /var/log
    ├─ 61M  journal (journald, limitado a 1G)
    └─ 7,1M sysstat
```

**Diretório que merece atenção: `/var/lib/containerd` (7,2 GB)** — concentra o acúmulo de imagens e cresce a cada deploy sem teto. Todo o resto está sob controle e é pequeno. Logs de container são minúsculos (16 KB no web, 0 no traefik) graças à rotação (§estado dos logs).

---

## 5. Auditoria da pipeline de deploy

**Fluxo (arquivo `.github/workflows/app-prod.yml`):**
1. Push em `main` → build da imagem **no runner do GitHub Actions** (não na VPS).
2. Push para GHCR com tags `prod-<sha>` (imutável) + `prod-latest` (móvel).
3. SCP dos configs (compose + traefik) para `/opt/ordemnamesa-prod/`.
4. SSH na VPS: `docker compose pull nextjs` + `docker compose up -d --remove-orphans`.

**O deploy gera resíduo ao longo do tempo? SIM — imagens.** Evidências:
- O build é **remoto (GHA)**, então a VPS **não acumula build cache** (confirmado: `Build Cache 0B`). ✅
- Mas cada `docker compose pull` baixa uma nova `prod-<sha>`; quando `prod-latest` é repontado, a imagem anterior perde a tag e vira **dangling**. `--remove-orphans` remove apenas *containers* órfãos, **nunca imagens**.
- **Não existe nenhum `docker image prune`, `docker system prune`, `docker builder prune` nem política de retenção** — verificado em todo o CI (`.github/workflows/*`), nos compose files e nos scripts de setup (`infra/scripts/setup-prod.sh`, `infra-prod.yml`).
- **Resultado observado na VPS:** 55 imagens dangling acumuladas, 7,2 GB em containerd. É **idempotente na aplicação** (sempre converge para o estado desejado), mas **não idempotente no armazenamento** — cresce monotonicamente.

O único mecanismo de "retenção" no repositório (`photo-retention.yml`) é **de dados da aplicação** (fotos/histórico via endpoint HTTP), não tem relação com Docker/SO.

---

## 6. Problemas encontrados

### Problema #1 — Acúmulo ilimitado de imagens Docker (sem prune)
- **Descrição:** Cada deploy deixa a imagem anterior como dangling; nada as remove.
- **Evidências:** 55 imagens `<none>` (2 meses → 4 dias); `docker system df` → 9,76 GB reclamáveis (127%); `/var/lib/containerd` = 7,2 GB; ausência total de prune no CI/scripts/compose.
- **Impacto:** Crescimento monotônico do disco. Hoje irrelevante (11% de 96 GB), mas ilimitado.
- **Severidade:** 🟡 **Média** (baixa urgência, alta certeza; é dívida que só cresce).

### Problema #2 — Container web permanentemente "unhealthy" (healthcheck falso-negativo)
- **Descrição:** O healthcheck do Docker (`wget -qO- http://localhost:3000/api/health`) falha *de dentro do container* com *connection refused*, embora o app esteja no ar.
- **Evidências:** `docker inspect` → `unhealthy (FailingStreak=13520)`; `docker exec ... wget localhost:3000` → *connection refused*; **porém** `https://ordemnamesa.com.br/api/health` → **HTTP 200** e Traefik serve via `http://nextjs:3000` normalmente. Causa provável: `localhost` resolve para IPv6 `::1` dentro do container enquanto o Next.js (standalone, `HOSTNAME=0.0.0.0`) escuta só IPv4 → loopback recusado, mas a interface de rede do container responde.
- **Impacto:** Sem impacto no tráfego (Traefik roteia por config de arquivo, não por health do Docker; e o Docker **não** reinicia por healthcheck). **Mas o sinal de saúde fica permanentemente vermelho** → impossível distinguir uma queda real de um falso-negativo; qualquer monitoramento baseado em `docker ps`/health é inútil.
- **Severidade:** 🟡 **Média** (observabilidade comprometida; mascara incidentes futuros).

### Problema #3 — Ausência de swap
- **Descrição:** Nenhum swap configurado (`swapon --show` vazio, `/proc/swaps` vazio).
- **Evidências:** `Swap: 0B`. RAM atual folgada (1,2/7,8 GiB), mas sem margem para picos → risco de OOM-kill em vez de degradação graciosa.
- **Severidade:** 🟢 **Baixa** (RAM sobra hoje; é uma rede de segurança ausente).

### Problema #4 — Reboot pendente para novo kernel
- **Descrição:** Rodando `6.8.0-107` há 85 dias; `6.8.0-134` já instalado e não ativado.
- **Evidências:** `dpkg -l linux-image-*` lista ambos; `uname` = 6.8.0-107.
- **Severidade:** 🟢 **Baixa** (correções de segurança do kernel só aplicam após reboot).

### Problema #5 — Sem backup de estado de host (mitigado por arquitetura stateless)
- **Descrição:** Só há backups de sistema (`/var/backups`, ~2 MB, dpkg/alternatives). Nenhum backup de `/opt/ordemnamesa-prod`.
- **Evidências:** `ls /var/backups` só tem `alternatives.tar.*`; sem crontab de backup.
- **Impacto atenuado:** O host é praticamente **stateless** — banco e fotos ficam no Supabase; o único estado local é `traefik/acme.json` (certificados Let's Encrypt, regeneráveis) e `.env` (reprodutível a partir dos GitHub Secrets).
- **Severidade:** 🟢 **Baixa**.

### Problema #6 — Postura de segurança do host (fora do escopo primário, registrado)
- **Descrição:** `ufw` inativo, `fail2ban` ausente, SSH como `root` por chave.
- **Evidências:** `ufw status` = inactive; `fail2ban` inativo/ausente.
- **Severidade:** 🟢 **Baixa/informativo** (a Hostinger provê firewall de borda + `monarx-agent`; ainda assim é superfície ampla).

---

## 7. Riscos futuros

- **Imagens (Problema #1):** com ~55 imagens acumuladas em ~2 meses e crescimento físico líquido de ~130 MB/imagem em `/var/lib/containerd`, a uma cadência de ~1 deploy/dia isso soma **~3–4 GB/mês**. Com 87 GB livres, o runway até saturar é de **~18–24 meses** ignorando qualquer limpeza — longe de crítico, mas o `docker system df` já sinaliza 9,76 GB reclamáveis e a tendência é monotônica. Sem ação, em algum momento (>1 ano) vira problema de disco; muito antes disso vira ruído em qualquer auditoria.
- **Healthcheck (Problema #2):** enquanto permanecer vermelho por design, uma **queda real do app passará despercebida** por qualquer alerta baseado em health. O risco é de *detecção tardia de incidente*, não de indisponibilidade causada pelo healthcheck.
- **Swap (Problema #3):** um pico de memória (build acidental na VPS, vazamento no Node, tarefa pesada) pode causar **OOM-kill abrupto** do `next-server` em vez de swap+degradação.
- **Kernel (Problema #4):** quanto mais tempo sem reboot, mais defasadas ficam as correções de segurança já baixadas.

---

## 8. Recomendações

> Nenhuma foi implementada — esta fase é somente diagnóstico. Todas exigiriam uma etapa posterior de mudança.

### R1 — Adicionar prune de imagens ao final do deploy · Prioridade **Alta**
- **Objetivo:** Impedir o acúmulo monotônico de imagens dangling.
- **Como (etapa futura):** acrescentar ao script SSH do `app-prod.yml`, após `docker compose up -d`, um passo do tipo `docker image prune -f` (remove só dangling) ou, mais conservador, `docker image prune -a --filter "until=168h" -f` (mantém última semana). **Não** usar `docker system prune -a` sem cuidado (removeria o cache/traefik se parado).
- **Benefício:** reclama ~6,5 GB agora e mantém `/var/lib/containerd` estável indefinidamente.
- **Justificativa técnica:** é exatamente a lacuna do KidPass; o custo é uma linha idempotente no deploy.

### R2 — Corrigir o healthcheck do container web · Prioridade **Alta**
- **Objetivo:** Tornar o sinal de saúde confiável.
- **Como (etapa futura):** trocar `http://localhost:3000` por `http://127.0.0.1:3000` no `HEALTHCHECK` do `Dockerfile` e no `healthcheck` do `docker-compose.prod.yml` (força IPv4 e evita o `::1`). Validar com `docker inspect ... Health.Status` = healthy após redeploy.
- **Benefício:** recupera a capacidade de detectar quedas reais; remove o falso "unhealthy" perpétuo.
- **Justificativa técnica:** o app já responde 200 em IPv4; o defeito é só o alvo `localhost`.

### R3 — Configurar swap (ex.: 2–4 GB) · Prioridade **Média**
- **Objetivo:** Rede de segurança contra OOM.
- **Como (etapa futura):** `swapfile` de 2–4 GB + `vm.swappiness=10`, persistido em `/etc/fstab`, idealmente adicionado ao `setup-prod.sh` para reprodutibilidade.
- **Benefício:** degradação graciosa em picos em vez de kill abrupto.
- **Justificativa técnica:** VM de 2 vCPU / 8 GB sem swap perde o amortecedor padrão de servidores Linux.

### R4 — Rotina de reboot pós-kernel + política de janela · Prioridade **Média**
- **Objetivo:** Ativar kernels de segurança já baixados.
- **Como (etapa futura):** reboot manual em janela de baixa (kernel 6.8.0-134 pendente) e considerar `unattended-upgrades` com `Automatic-Reboot` em horário definido.
- **Benefício:** fecha a janela entre patch baixado e patch ativo.

### R5 — Prune agendado como defesa em profundidade (opcional) · Prioridade **Baixa**
- **Objetivo:** Rede de segurança caso R1 falhe ou para imagens muito antigas.
- **Como (etapa futura):** `systemd timer` semanal na VPS rodando `docker image prune -af --filter "until=336h"`.
- **Benefício:** garante limpeza mesmo em deploys manuais/fora do CI.

### R6 — Documentar a infra de PROD e considerar backup do `acme.json` · Prioridade **Baixa**
- **Objetivo:** Reprodutibilidade e menor risco de rate-limit do Let's Encrypt.
- **Como (etapa futura):** documentar a VPS Hostinger no `infra/README.md` (hoje só descreve o nonprod OCI); opcionalmente versionar/backupar `acme.json`.
- **Justificativa:** hoje só há `setup-prod.sh`; não há doc do ambiente de produção.

---

## 9. Comparação explícita com o KidPass (PROD e NONPROD)

| Pergunta | KidPass | **PROD** (Hostinger) | **NONPROD** (OCI) |
|---|---|---|---|
| Deploy gera novas imagens continuamente? | Sim | 🔴 Sim (`prod-<sha>`/deploy) | 🔴 Sim (`nonprod-<sha>`/deploy) |
| Imagens antigas nunca removidas? | Sim | 🔴 Sim (55 dangling) | 🔴 Sim (**247 dangling**) |
| Ausência de prune no deploy? | Sim | 🔴 Sim | 🔴 Sim |
| Quantidade acumulada | 220+ | 57 (55 dangling) | **249 (247 dangling)** |
| Espaço em imagens | ~25 GB | ~7,2 GB (9,76 GB reclam.) | **~31 GB** |
| % de disco comprometido | alto | ✅ 11% de 96 GB | 🔴 **72% de 49 GB** |
| Rotação de log de container | ausente | ✅ `logrotate` presente | 🔴 **ausente** |
| Folga de RAM | — | ✅ 7,8 GB | 🔴 **956 MB (68 MB livres)** |

**Respostas diretas às perguntas do escopo:**
- **Existe o mesmo comportamento?** **Sim, nos dois.** Causa-raiz idêntica: deploy sem prune → imagens dangling que nunca somem.
- **Existe algo semelhante ao KidPass?** O **NONPROD é praticamente o KidPass**: 247 imagens dangling, ~31 GB, disco 72% e sem a rotação de log que protege o prod. O **PROD** é a versão inicial/branda do mesmo problema.
- **Existe risco futuro?** **PROD:** crescimento ilimitado, runway longo (~18–24 meses). **NONPROD:** risco **iminente** — a ~130 MB/deploy líquidos e cadência de `develop`, os 14 GB livres esgotam em **poucos meses**, podendo travar deploys e o próprio SO na VM micro.
- **Existe desperdício de espaço?** Sim: ~7,2 GB (prod) e **~31 GB (nonprod)**.
- **Existe crescimento contínuo?** Sim, monotônico nos dois.

**Diferença de gravidade:** o KidPass já era crítico; o **NONPROD do Ordem na Mesa já está no mesmo patamar crítico**, enquanto o **PROD** foi pego em estágio inicial. A correção (prune no deploy) é a mesma para ambos e deve começar pelo NONPROD.

---

## 10. Ambiente NONPROD (OCI) — 🔴 CRÍTICO

Auditado via SSH read-only em `ubuntu@147.15.27.144`. Mesmo padrão de deploy do prod (`docker compose pull` + `up -d`, tags `nonprod-<sha>`/`nonprod-latest`), mas em VM Always Free minúscula e com **cadência de deploy maior** (todo push em `develop`).

### 10.1. Estado da VM
| Recurso | Valor | Avaliação |
|---|---|---|
| SO / kernel | Ubuntu 22.04.5 LTS · 6.8.0-1044-oracle | ✅ |
| CPU | 2 vCPU · load 0.00 | ✅ ocioso |
| **RAM** | **956 MiB total — 517 usados, ~68 livres / 289 disp.** | 🔴 apertada |
| **Swap** | **0 B** | 🔴 sem amortecedor numa VM de <1 GB |
| **Disco `/`** | **49 GB total — 35 GB usados (72%)**, 14 GB livres | 🔴 pressionado |
| Inodes | 14% | ✅ |
| Uptime | 114 dias | ⚠️ reboot antigo |
| Web app | `Up 4 days (unhealthy)` | ⚠️ mesmo falso-negativo do prod |

### 10.2. Docker — o acúmulo em escala KidPass
```
Containers: 2 (2 running)   Images: 249   Storage: overlayfs   Logging: json-file
docker system df → Images 249 total / 2 ativos / 31.27GB
```
- **249 imagens; 247 dangling (`<none>`)** — uma por deploy de `develop`, empilhadas sem limpeza.
- **~31 GB** de imagens (o *image store* real do containerd, dentro dos 33 GB de `/var`).
- **Disco em 72%** — `/var` sozinho = 33 GB de 35 GB usados; o containerd é o dominante.
- Containers: `web` (unhealthy, 13.579 falhas — falso-negativo idêntico ao prod) + `traefik` (healthy, 3 meses). Ambos `restart: always`. 0 volumes, 0 networks órfãs, 0 build cache.

### 10.3. Higiene de host — pior que o prod
| Item | PROD | **NONPROD** |
|---|---|---|
| `logrotate` p/ logs de container | ✅ `docker-containers` | 🔴 **ausente** |
| `daemon.json` (log rotation) | ausente (compensado por logrotate) | 🔴 **ausente e sem compensação** |
| `journald` | limitado 1 GB / 7 dias (custom) | ⚠️ **default** (já em 1,0 GB; teto ~4 GB) |
| `unattended-upgrades` | habilitado | ✅ habilitado |
| Prune de imagens (cron/timer/CI) | 🔴 nenhum | 🔴 **nenhum** |
| Swap | 🔴 nenhum | 🔴 nenhum |

> **Ponto crítico:** no nonprod **não há rotação de log de container** (nem `logrotate` específico nem `daemon.json`). Hoje os arquivos ainda são pequenos, mas somado ao disco já em 72% e à ausência de prune, qualquer container "falador" acelera o esgotamento.

### 10.4. Problemas e severidade (NONPROD)
- **N1 — Acúmulo de 247 imagens / ~31 GB com disco em 72% · 🔴 Crítico.** Runway curto (meses) até 100%; risco de travar deploys (`pull` sem espaço) e o SO da VM micro.
- **N2 — Sem rotação de log de container · 🟠 Alta.** `daemon.json` e `logrotate` ausentes → crescimento potencialmente ilimitado somado a disco já pressionado.
- **N3 — Web container unhealthy (falso-negativo) · 🟡 Média.** Mesmo defeito `localhost`/IPv6 do prod.
- **N4 — VM sem swap e RAM apertada (68 MB livres) · 🟡 Média.** Alto risco de OOM-kill.

### 10.5. Recomendações (NONPROD) — mesma base do prod, prioridade elevada
- **RN1 (🔴 Alta imediata):** liberar espaço agora — numa etapa posterior, `docker image prune -f` no nonprod reclama a maior parte dos ~31 GB (derruba o disco de 72% para ~pouco acima do baseline). **É a ação nº 1 de toda a auditoria.**
- **RN2 (🔴 Alta):** adicionar prune ao deploy do `app-nonprod.yml` (mesma linha do R1 do prod).
- **RN3 (🟠 Alta):** configurar `daemon.json` com `log-driver: json-file` + `max-size`/`max-file` (aplica a todos os containers e cobre a ausência de logrotate).
- **RN4 (🟡 Média):** trocar `localhost`→`127.0.0.1` no healthcheck (compartilhado com o prod, mesmo Dockerfile).
- **RN5 (🟡 Média):** swap de 1–2 GB na VM micro.

---

## Anexo — Por que o PROD NÃO é "crítico" (evidências de saúde)

Diferente do que o cenário KidPass poderia sugerir, boa parte da higiene operacional **já existe e funciona**:
- **Logs de container rotacionados:** existe `/etc/logrotate.d/docker-containers` e `logrotate.timer` roda diariamente; arquivos `*-json.log` atuais têm 16 KB / 0 B. (Mesmo sem `daemon.json`, não há crescimento ilimitado de log.)
- **journald limitado:** `SystemMaxUse=1G`, `SystemMaxFileSize=100M`, `MaxRetentionSec=7day`, `Compress=yes`; uso atual 52 MB.
- **Atualizações automáticas ativas:** `unattended-upgrades` habilitado; `20auto-upgrades` com update+upgrade = `"1"`; timers `apt-daily`/`apt-daily-upgrade` ativos.
- **Sem lixo de containers/volumes/networks:** 0 containers parados, 0 volumes, 0 networks órfãs, 0 build cache.
- **Recursos folgados:** disco 11%, inodes 3%, RAM 15%, load ~0, site 200.

Por isso o veredito do **PROD** é **ATENÇÃO** (dois problemas reais de dívida operacional) e não **CRÍTICO** (nada ameaça a disponibilidade ou o disco no curto prazo). O **NONPROD**, ao contrário, **é crítico** — ver §10.

---
*Auditoria conduzida via SSH somente-leitura em ambos os ambientes (PROD Hostinger e NONPROD OCI); chaves de acesso efêmeras removidas ao final. Nenhuma alteração foi feita em nenhum ambiente.*
