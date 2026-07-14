# Plano de Validação & Testes — Correções de Infra Docker/Deploy (Ordem na Mesa)

**Data:** 2026-07-11
**Status:** Checklist oficial da fase de implementação. **Nenhuma alteração foi feita** — este documento define *como* validar cada mudança antes/depois de aplicá-la.
**Base:** `auditoria-vps-prod-2026-07-11.md` + `revisao-estrategia-limpeza-docker.md`.
**Ambientes:** PROD (Hostinger `187.127.3.104`, disco 96 GB) · NONPROD (OCI `147.15.27.144`, disco 49 GB, VM micro 956 MB).

---

## Como usar este documento

- Cada mudança tem: **Riscos → Testes → Evidências → Métricas → Critérios de sucesso/falha → Rollback do teste**.
- **Regra de ouro:** toda mudança é validada **primeiro no NONPROD**; só após "verde" replica-se no PROD.
- **Baseline obrigatório:** antes de qualquer alteração, capturar o estado atual (§Baseline) para comparar depois.
- Convenção de comandos: todos read-only exceto onde marcado `[MUTA]`. Comandos são referência — não executar nesta fase.

### Baseline a capturar (os dois ambientes, antes de tudo)
```bash
docker system df && docker system df -v > baseline_df.txt
docker images -a | wc -l                      # contagem total
docker images -f dangling=true -q | wc -l     # dangling
df -h / && df -i /                             # disco + inodes
docker ps -a --format '{{.Names}} {{.Status}}'
docker inspect --format '{{.Name}} {{.State.Health.Status}}' $(docker ps -aq)
gh api "/user/packages/container/ordem-na-mesa-web/versions" --paginate | jq length  # tags no GHCR
```
Guardar em `docs/infra-audit/evidencias/<data>/<env>/`.

---

## 1. Reclaim inicial do NONPROD (one-shot)

**Mudança:** `docker image prune -f` [MUTA] para liberar ~31 GB no NONPROD.

- **Riscos:** remover imagem de rollback quente; num cenário raro, remover imagem referenciada por container parado.
- **Testes:**
  1. *Pré:* `docker ps` confirma web+traefik **Up**; anotar IDs das imagens em uso (`docker inspect --format '{{.Image}}' <container>`).
  2. *Dry-run mental:* `docker images -f dangling=true` lista o que sairá (deve bater com ~247).
  3. *Executar* `docker image prune -f`.
  4. *Pós:* app responde `curl -sf https://nonprod.ordemnamesa.com/api/health` = 200; `docker ps` inalterado.
- **Evidências:** `docker system df` antes/depois (imagens 249→~2, ~31 GB→<1 GB); `df -h /` (72%→~30%).
- **Métricas:** nº de imagens, GB reclamados, disco %, HTTP do health.
- **Sucesso:** disco cai para <35%, web/traefik seguem Up e healthy(externo)=200, imagem em uso intacta.
- **Falha:** app para de responder; imagem em uso removida; disco não cai.
- **Rollback do teste:** re-`docker compose up -d` (repuxa do GHCR se preciso). Sem perda — GHCR é fonte da verdade.

---

## 2. Correção do healthcheck (`localhost` → `127.0.0.1`)

**Mudança:** ajustar `HEALTHCHECK` no `Dockerfile` + `healthcheck` nos 2 compose. Afeta ambos via mesma imagem.

- **Riscos:** healthcheck continuar falhando por outra causa (endpoint quebrado, start_period curto); mascarar problema real se `/api/health` for shallow demais.
- **Testes:**
  1. Build da nova imagem no NONPROD; após `up -d`, aguardar `start_period` (30 s).
  2. `docker inspect --format '{{.State.Health.Status}}' <web>` → deve virar `healthy` (FailingStreak=0).
  3. `docker exec <web> wget -qO- http://127.0.0.1:3000/api/health` → corpo do health + exit 0.
  4. Comparar: `docker exec <web> wget -qO- http://localhost:3000/api/health` ainda pode falhar (esperado — confirma o diagnóstico IPv6/`::1`).
  5. **Teste negativo (falso positivo eliminado):** parar o app dentro do container (ou simular /api/health 500) e confirmar que health vira `unhealthy` em ≤ (interval×retries) = 90 s. `[MUTA/reversível]`
- **Evidências:** `docker inspect` mostrando transição unhealthy→healthy; e healthy→unhealthy no teste negativo; log de health (`.State.Health.Log`).
- **Métricas:** Health.Status, FailingStreak, tempo até detectar queda.
- **Sucesso:** healthy em operação normal **e** unhealthy quando o app realmente cai (o sinal passa a discriminar).
- **Falha:** permanece unhealthy com app OK (fix não resolveu) **ou** permanece healthy com app derrubado (sinal inútil).
- **Rollback do teste:** redeploy da imagem anterior (`IMAGE_TAG=<sha-anterior>`); o healthcheck volta ao estado antigo.

---

## 3. Concurrency guard nos workflows

**Mudança:** `concurrency: { group: deploy-<env>, cancel-in-progress: false }` em `app-prod.yml`/`app-nonprod.yml`.

- **Riscos:** `cancel-in-progress: true` por engano cancelaria um deploy no meio → estado inconsistente; fila muito longa atrasa deploys legítimos.
- **Testes:**
  1. Disparar **dois** `workflow_dispatch` do NONPROD em <5 s.
  2. Observar em `gh run list`: um **running**, outro **queued** (não simultâneos).
  3. Confirmar que o segundo só inicia o job `deploy` após o primeiro concluir.
  4. **Teste de cancelamento:** com `cancel-in-progress: false`, cancelar manualmente o run em fila e confirmar que o em execução termina íntegro (`docker compose ps` consistente, health 200).
  5. **Anti-teste:** validar que NÃO há sobreposição de `docker compose up` (checar timestamps nos logs SSH dos dois runs — não devem se intercalar).
- **Evidências:** `gh run list --workflow=app-nonprod.yml` mostrando estados running/queued serializados; logs SSH sem intercalação.
- **Métricas:** nº de deploys simultâneos observados (deve ser sempre ≤1 por ambiente), tempo em fila.
- **Sucesso:** nunca 2 deploys concorrentes no mesmo ambiente; cancelamento de item em fila não afeta o ativo.
- **Falha:** dois `up -d` intercalados; `.env`/compose corrompido; container em estado inconsistente.
- **Rollback do teste:** remover a chave `concurrency` (reverte ao comportamento atual). Nenhum efeito em runtime.

---

## 4. `docker image prune -f` inline após deploy

**Mudança:** acrescentar `docker image prune -f` ao fim do script SSH, **após** `docker compose up -d` ter sucesso.

- **Riscos:** rodar antes do `up` OK e remover algo do retry; latência adicional no deploy; remover imagem de rollback quente.
- **Testes (NONPROD primeiro):**
  1. **Deploy normal:** push → deploy; ao fim, `docker images -f dangling=true -q | wc -l` = 0; web/traefik Up e healthy; health 200.
  2. **Imagem em uso protegida:** anotar `docker inspect --format '{{.Image}}' <web>` antes; confirmar que segue presente depois do prune.
  3. **Traefik protegido:** `docker images traefik:v3.2 -q` ainda retorna a imagem após o prune.
  4. **Ordem correta:** inspecionar o script — `prune` só é alcançado se `up -d` retornou 0 (graças a `set -e`). Simular falha do `up` (tag inexistente) e confirmar que o prune **não** roda `[MUTA/reversível]`.
  5. **Tempo:** medir duração do passo de prune (esperado <2 s).
- **Evidências:** dangling=0 pós-deploy; ID da imagem em uso e do traefik presentes; log do deploy mostrando prune só após `up`.
- **Métricas:** dangling count (→0), duração do prune, disco estável entre deploys.
- **Sucesso:** cada deploy termina com 0 dangling, imagem viva + traefik intactos, app 200.
- **Falha:** dangling cresce; imagem em uso/traefik sumiu; prune rodou apesar de `up` falhar.
- **Rollback do teste:** remover a linha de prune do script (redeploy). Imagens voltam a acumular (estado atual), sem risco.

---

## 5. systemd timer de limpeza periódica

**Mudança:** unit + timer no host (`docker image prune -f`), semanal PROD / 2×semana NONPROD, adicionado a `setup-prod.sh`/`userdata.sh`.

- **Riscos:** timer sem `OnFailure`/log → falha silenciosa; sobreposição com deploy; `Persistent=true` disparar em massa após VM ligar.
- **Testes:**
  1. `systemctl list-timers | grep docker-prune` → aparece com `NEXT` correto.
  2. **Execução manual forçada:** `systemctl start docker-prune.service`; `journalctl -u docker-prune.service` mostra início/fim e nº reclamado `[MUTA — só dangling]`.
  3. **Sem nada para limpar (idempotência):** rodar 2× seguidas; a 2ª deve terminar exit 0 sem remover nada e sem erro.
  4. **Após vários deploys:** fazer 3 deploys, deixar o timer rodar, confirmar dangling→0.
  5. **Não colide com deploy:** o comando é dangling-only → seguro mesmo se coincidir com um `up` (imagem nova é referenciada). Validar rodando prune manual durante um deploy `[MUTA/controlado]`.
- **Evidências:** `journalctl -u docker-prune.service --since` com resultado de cada execução; `list-timers` com histórico `LAST/PASSED`.
- **Métricas:** execuções bem-sucedidas/agendadas, GB reclamados por execução, exit codes.
- **Sucesso:** timer dispara no horário, loga resultado, é idempotente, nunca toca imagem viva.
- **Falha:** não dispara; falha sem log; remove imagem em uso.
- **Rollback do teste:** `systemctl disable --now docker-prune.timer` [MUTA reversível]; remove unit. Volta ao estado sem timer.

---

## 6. `daemon.json` com limites de log (NONPROD)

**Mudança:** `/etc/docker/daemon.json` com `log-driver: json-file`, `max-size: 10m`, `max-file: 3`. Requer `systemctl restart docker` [MUTA — reinicia containers].

- **Riscos:** JSON inválido impede o Docker de subir; restart derruba os containers momentaneamente; só afeta containers **recriados** após a mudança (não os já rodando).
- **Testes:**
  1. **Validar JSON antes do restart:** `docker info` após colocar o arquivo + `dockerd --validate` (ou `python -m json.tool daemon.json`).
  2. Após restart + `up -d`: `docker inspect --format '{{.HostConfig.LogConfig}}' <web>` mostra `max-size:10m max-file:3`.
  3. **Teste de rotação:** gerar log (`docker exec <web>` produzir output, ou aguardar tráfego) até passar de 10 MB; confirmar que aparecem no máx. 3 arquivos `*-json.log*` e o total ≤ ~30 MB.
  4. Confirmar recuperação: web+traefik Up e healthy pós-restart, health 200.
- **Evidências:** `LogConfig` por container; `ls -lh /var/lib/docker/containers/*/*-json.log*` mostrando rotação ≤3 arquivos.
- **Métricas:** tamanho total de logs por container, nº de arquivos rotacionados.
- **Sucesso:** todo container novo com cap de 30 MB de log; Docker sobe sem erro; app volta 200.
- **Falha:** Docker não inicia (JSON inválido); logs crescem sem limite; container não recria.
- **Rollback do teste:** remover/restaurar `daemon.json` + `systemctl restart docker` [MUTA reversível]. **Ter backup do arquivo antes.**

---

## 7. Criação de swap (NONPROD)

**Mudança:** swapfile 1–2 GB + `vm.swappiness=10` + entrada em `/etc/fstab` [MUTA].

- **Riscos:** entrada errada no `fstab` impede boot; swap em disco pressionado (72%) consome espaço → **fazer só APÓS o reclaim §1**.
- **Testes:**
  1. `swapon --show` e `free -h` mostram swap ativo com o tamanho definido.
  2. `cat /proc/sys/vm/swappiness` = 10.
  3. **Persistência:** `findmnt --verify` / validar `fstab`; (reboot é opcional e agressivo — só em janela) confirmar swap reativa após reboot.
  4. Confirmar disco ainda saudável (swapfile não recolocou o disco em pressão).
- **Evidências:** `swapon --show`, `free -h`, `/etc/fstab` com a linha do swap, `df -h /` pós-criação.
- **Métricas:** swap total/usado, swappiness, disco % após adicionar swap.
- **Sucesso:** swap ativo e persistente; disco continua <40%; sem impacto no boot.
- **Falha:** swap não ativa; `fstab` quebra boot; disco volta a pressão.
- **Rollback do teste:** `swapoff` + remover linha do `fstab` + apagar o swapfile [MUTA reversível].

---

## 8. Retenção de imagens no GHCR

**Mudança:** action de retenção (ex.: mantém 30–90 dias / N versões de `<sha>`, preserva `*-latest`).

- **Riscos:** apagar um `<sha>` ainda necessário para rollback; apagar acidentalmente `latest`; afetar o cache `cache-from`.
- **Testes (rodar em **dry-run** primeiro):**
  1. Executar a action em modo dry-run; revisar a lista do que **seria** apagado — confirmar que nenhum `*-latest` e nenhum `<sha>` dentro da janela de rollback aparece.
  2. Confirmar contagem no GHCR antes/depois: `gh api /user/packages/container/ordem-na-mesa-web/versions --paginate | jq length`.
  3. **Rollback pós-retenção:** escolher um `<sha>` **dentro** da janela e confirmar que `docker pull ghcr.io/...:<sha>` ainda funciona.
  4. Confirmar que o build seguinte ainda acha o cache (`cache-from: ...:*-latest`) — build time não dispara.
- **Evidências:** log dry-run; contagem de versões antes/depois; pull bem-sucedido de um `<sha>` retido.
- **Métricas:** nº de versões no GHCR, idade da mais antiga retida, build time (cache hit).
- **Sucesso:** só `<sha>` fora da janela some; `latest` e janela de rollback preservados; cache intacto.
- **Falha:** `latest` removido; `<sha>` da janela removido; cache invalidado (build lento).
- **Rollback do teste:** GHCR não tem "undo" de delete → **por isso o dry-run obrigatório**. Mitigação: janela ampla (90 dias) e primeira execução conservadora.

---

## 9. Documentação do processo de rollback

**Mudança:** `docs/` com procedimento + (opcional) `rollback.sh` / `workflow_dispatch` com `IMAGE_TAG`.

- **Riscos:** procedimento documentado mas não testado ("runbook de papel").
- **Testes (game-day no NONPROD):**
  1. Seguir o runbook **ao pé da letra** para reverter ao `<sha>` anterior (sem conhecimento prévio).
  2. Cronometrar do início ao app respondendo 200 na versão antiga.
  3. **Rollback após prune:** rodar `docker image prune -f` (remove a imagem antiga local), então executar o rollback → deve re-puxar do GHCR e funcionar.
  4. Confirmar dependência do GHCR: simular indisponibilidade do `<sha>` local e verificar que o pull do GHCR cobre.
- **Evidências:** log do game-day; tempo medido; health 200 na versão revertida.
- **Métricas:** tempo de rollback (com cache local vs re-pull), taxa de sucesso do runbook por quem não o escreveu.
- **Sucesso:** rollback concluído em tempo alvo (ver §Rollback abaixo) mesmo após prune; runbook executável sem improviso.
- **Falha:** runbook ambíguo; rollback falha após prune; dependência não documentada.
- **Rollback do teste:** redeploy da versão atual (`develop`/`main` HEAD).

---

## 10. Monitoramento sintético externo

**Mudança:** monitor externo (UptimeRobot/BetterStack/healthchecks.io) em `https://ordemnamesa.com.br/api/health` (e nonprod).

- **Riscos:** alerta ruidoso (flapping); alerta silencioso (mal configurado); depender só do check interno.
- **Testes:**
  1. Configurar o monitor; confirmar que reporta **UP** com o app no ar.
  2. **Teste de detecção real:** parar o container web no NONPROD por ~1 min `[MUTA/controlado]`; confirmar que o monitor externo dispara alerta e registra downtime.
  3. Restaurar; confirmar recuperação e resolução do alerta.
  4. Validar canal de notificação (e-mail/WhatsApp) chega.
- **Evidências:** histórico do monitor mostrando o downtime induzido; alerta recebido; timestamp de detecção.
- **Métricas:** tempo de detecção (deve ser ≤ 1–2 intervalos de check), uptime %, MTTR do alerta.
- **Sucesso:** downtime real detectado e notificado; sem falso-alarme em operação normal.
- **Falha:** não detecta a queda induzida; alerta não chega; flapping constante.
- **Rollback do teste:** religar o container; pausar/remover o monitor se necessário.

---

## Cenários transversais obrigatórios (matriz de deploy × falha)

Validar no NONPROD, na ordem, cada linha isoladamente:

| Cenário | Como induzir | Evidência de sucesso |
|---|---|---|
| **Deploy normal** | push em `develop` | app 200, dangling=0, health healthy |
| **Deploy consecutivo** | 2 pushes seguidos | serializados (concurrency), disco estável, 0 dangling ao fim |
| **Deploy interrompido** | matar a sessão SSH após `pull`, antes do `up` `[MUTA]` | container antigo segue no ar (200); próximo deploy converge |
| **Falha no pull** | `IMAGE_TAG` inexistente | `set -e` aborta; **prune NÃO roda**; container atual intacto |
| **Falha no up** | compose inválido temporário | aborta antes do prune; app antigo no ar |
| **Rollback após deploy** | `IMAGE_TAG=<sha-anterior>` | versão antiga 200 |
| **Rollback após prune** | prune + rollback | re-pull do GHCR, versão antiga 200 |
| **Deploy concorrente** | 2 workflow_dispatch <5 s | nunca 2 `up` simultâneos |

---

## Plano de execução (sequência lógica)

| # | Etapa | Ambiente | Automatizável? | Manual? |
|---|---|---|---|---|
| 0 | Capturar baseline | NONPROD + PROD | ✅ script | — |
| 1 | Reclaim inicial | **NONPROD** | ⚠️ semi (comando único) | ✅ execução supervisionada |
| 2 | Fix healthcheck (build+deploy) | **NONPROD** → PROD | ✅ CI | verificação manual do teste negativo |
| 3 | Concurrency guard | **NONPROD** → PROD | ✅ CI | disparo duplo manual |
| 4 | Prune inline | **NONPROD** → PROD | ✅ CI | cenários de falha manuais |
| 5 | daemon.json logs | **NONPROD** | ⚠️ requer restart docker | ✅ supervisionado |
| 6 | Swap | **NONPROD** | ⚠️ | ✅ supervisionado (após §1) |
| 7 | systemd timer | **NONPROD** → PROD | ✅ (no setup script) | trigger manual p/ validar |
| 8 | Retenção GHCR | compartilhado (CI) | ✅ (dry-run first) | revisão manual do dry-run |
| 9 | Doc rollback (game-day) | **NONPROD** | — | ✅ manual (por outra pessoa) |
| 10 | Monitor externo | NONPROD + **PROD** | ⚠️ config externa | ✅ teste de downtime induzido |

**Regras de promoção:**
- **Somente NONPROD** (nunca testar em PROD): reclaim destrutivo (§1), deploy interrompido, falha de pull/up, downtime induzido, restart do daemon.
- **Somente PROD** (validação final, não indução de falha): observação passiva de disco estável ao longo de N deploys reais; monitor externo em produção. **Nunca** induzir falha em PROD.
- **Gate:** nenhuma mudança vai a PROD sem estar "verde" no NONPROD por ≥ 3 deploys reais.

---

## Critérios de aceite globais (fim da fase)

1. **Disco estável:** após ≥ 20 deploys no NONPROD, `df -h /` varia < 2 GB (não cresce monotônico). Evidência: gráfico/tabela de disco por deploy.
2. **Dangling sempre 0** após cada deploy (inline) e após cada timer.
3. **Imagem viva + Traefik nunca removidos** em nenhum cenário de teste.
4. **Health discrimina:** healthy em operação, unhealthy em queda real, em ≤ 90 s.
5. **Rollback ≤ alvo** (ver abaixo) mesmo após prune, com o GHCR como fonte.
6. **Zero deploys concorrentes** observados por ambiente.
7. **Monitor externo** detectou o downtime induzido e notificou.

### Alvos de tempo de rollback
- Com imagem quente local (PROD, N=3): **< 30 s** (só `up -d`).
- Com re-pull do GHCR (pós-prune / NONPROD): **< 2–3 min** (pull do layer único ~80–190 MB sobre base já presente).

---

## Matriz-resumo (checklist oficial)

| Alteração | Risco principal | Testes-chave | Evidência esperada | Critério de sucesso | Rollback se o teste falhar |
|---|---|---|---|---|---|
| **1. Reclaim NONPROD** | remover imagem em uso | ps antes/depois, health 200 | df 72%→<35%, 249→2 imgs | disco cai, app 200 | `compose up -d` (re-pull GHCR) |
| **2. Healthcheck 127.0.0.1** | continuar falhando / mascarar | inspect health, teste negativo | unhealthy→healthy e healthy→unhealthy | sinal discrimina em ≤90 s | redeploy `<sha>` anterior |
| **3. Concurrency guard** | cancel-in-progress errado | 2 dispatch, gh run list | running+queued serializados | nunca 2 `up` simultâneos | remover chave `concurrency` |
| **4. Prune inline** | rodar antes de `up` OK | deploy normal + falhas, ordem | dangling=0, img viva+traefik ok | 0 dangling, app 200 | remover linha do script |
| **5. systemd timer** | falha silenciosa | trigger manual, idempotência | journal com resultado | dispara, loga, idempotente | `disable --now` timer |
| **6. daemon.json logs** | JSON inválido / restart | validar JSON, rotação | LogConfig 10m×3, ≤3 arquivos | cap de log ativo, Docker sobe | restaurar backup + restart |
| **7. Swap** | fstab quebra boot | swapon, findmnt --verify | swap ativo, swappiness=10 | swap persistente, disco <40% | swapoff + remover fstab |
| **8. Retenção GHCR** | apagar `<sha>` útil | **dry-run**, pull de retido | latest+janela preservados | só fora-da-janela some | (sem undo) → dry-run obrigatório |
| **9. Doc rollback** | runbook não testado | game-day + rollback pós-prune | tempo medido, 200 na versão antiga | rollback ≤ alvo após prune | redeploy HEAD |
| **10. Monitor externo** | não detectar / flapping | downtime induzido | histórico com o downtime | detecta + notifica ≤2 checks | religar container, pausar monitor |

---

## Cenários Docker específicos (checklist detalhado)

| Verificação | Método objetivo | Sucesso |
|---|---|---|
| Dangling são removidos | `docker images -f dangling=true -q \| wc -l` após deploy/timer | = 0 |
| Imagens em uso nunca removidas | comparar `docker inspect --format '{{.Image}}'` do web antes/depois | ID idêntico e presente |
| Rollback funciona | deploy `<sha-anterior>` → health 200 | 200 na versão antiga |
| Traefik nunca perde imagem | `docker images traefik:v3.2 -q` após prune | retorna a imagem |
| Build cache conforme esperado | `docker system df` (host) = 0; GHA `cache-from` hit | cache local 0, build usa cache do registry |

**Nada foi implementado.** Este documento é o checklist a seguir durante a fase de correção, na ordem e com os gates definidos.
