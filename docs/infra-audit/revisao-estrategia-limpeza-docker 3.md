# Revisão Arquitetural — Estratégia de Limpeza Docker & Deploy (Ordem na Mesa)

**Data:** 2026-07-11
**Escopo:** Análise crítica da estratégia de correção **antes** de qualquer implementação. Nenhuma alteração foi feita.
**Base:** Auditoria `docs/infra-audit/auditoria-vps-prod-2026-07-11.md` (PROD Hostinger 🟡 + NONPROD OCI 🔴).

---

## Fatos de arquitetura que sustentam esta revisão

Três verificações no código de deploy mudam materialmente as conclusões:

1. **O GHCR é a fonte da verdade — e é imutável.** Cada build faz push de duas tags para `ghcr.io/hiagogouveia/ordem-na-mesa-web`: `<env>-<sha>` (imutável) + `<env>-latest` (móvel). **Não existe limpeza de GHCR** em nenhum workflow → todo o histórico de releases permanece no registry. **Consequência central:** o rollback **não depende** das imagens locais da VPS. Qualquer versão antiga é recuperável com `docker compose pull` do GHCR. As imagens locais são apenas um *cache quente* que torna o rollback instantâneo (evita ~poucos segundos de pull).

2. **As imagens antigas acabam como `<none>` (dangling).** A auditoria mostrou 55/57 (prod) e 247/249 (nonprod) sem tag. Isso ocorre porque a tag `latest` (e o realias local) migra para o novo digest a cada deploy, "desamarrando" o anterior. **Consequência:** um `docker image prune -f` **dangling-only** já reclama praticamente todo o acúmulo, sem nunca tocar na imagem em uso (protegida pelo container em execução) nem no Traefik (sempre rodando).

3. **Não há controle de concorrência (`concurrency:`) nos workflows.** Dois pushes em `develop`/`main` em curto intervalo podem disparar **deploys sobrepostos** na mesma VPS, e `docker compose up -d` não é seguro sob concorrência. Isso é um risco pré-existente e independe da limpeza — mas precisa ser considerado junto.

---

## 1. Crítica técnica da estratégia inicialmente proposta

A proposta inicial (prune ao fim do deploy + rotação de logs + fix do healthcheck) **está direcionalmente correta, mas subespecificada e ambígua em pontos perigosos**. Críticas:

| Ponto proposto | Avaliação crítica |
|---|---|
| "executar `docker image prune`" | **Ambíguo e potencialmente perigoso.** `docker image prune` (dangling) é seguro; `docker image prune -a` (remove toda imagem sem container) removeria o Traefik se ele estivesse parado no instante, e mataria qualquer imagem de rollback quente. `docker system prune -a` é ainda mais agressivo (pega redes, cache e, com `--volumes`, dados). A proposta não diz **qual** — e a diferença é entre "seguro" e "quebra o serviço". |
| "ao final do deploy" | **Trigger correto como primário, mas frágil como único.** Se o deploy for interrompido *antes* do prune, o lixo persiste até o próximo deploy. E não cobre deploys manuais nem o passivo já acumulado (31 GB no nonprod). Precisa de uma segunda camada (timer). |
| "rotação de logs" | **Correto e faltante — mas só no NONPROD.** O PROD já tem `logrotate.d/docker-containers`; o NONPROD não tem nada. Aplicar cegamente "rotação de logs" nos dois ignora que a solução robusta (limite no daemon) difere de `logrotate` de arquivo. |
| "corrigir o healthcheck (localhost→127.0.0.1)" | **Corrige o sintoma, mas não questiona a arquitetura de health.** O healthcheck hoje **não é aplicado a nada** (Traefik roteia por file-provider, Docker não reinicia por health). Tornar o sinal preciso é necessário, mas não dá self-healing nem readiness. Ver §8. |

**Conclusão da crítica:** a estratégia acerta o alvo, mas precisa ser (a) **específica** sobre qual comando de prune, (b) **defensiva** (não destrutiva sob concorrência/interrupção), (c) **diferenciada por ambiente**, e (d) **honesta** sobre o que o healthcheck realmente entrega.

---

## 2. Riscos encontrados

Analisando cada risco levantado no pedido:

| Risco | Existe aqui? | Análise |
|---|---|---|
| **Perda de rollback** | 🟢 Baixo | GHCR guarda todos os `<sha>`. Prune local nunca destrói a *capacidade* de rollback, só a *velocidade* (re-pull de segundos). |
| **Remoção de imagens úteis** | 🟢 Baixo (com dangling-only) | Prune dangling nunca remove imagem referenciada por container. A imagem em uso e o Traefik ficam protegidos. Só vira risco com `-a`/`system prune`. |
| **Deploys simultâneos** | 🟠 Médio | **Risco real e pré-existente** (sem `concurrency:`). Dois `up -d` concorrentes competem pelo mesmo compose/.env. Prune não piora isso, mas a correção deve incluir um `concurrency` guard. |
| **Deploy interrompido** | 🟡 Baixo-Médio | Se cair após `pull` e antes do `up`, o container antigo segue no ar (idempotente). Se o prune for inline e a sessão SSH cair antes dele, o lixo persiste até o próximo ciclo (auto-recупerável). Prune **nunca** deve rodar *antes* do `up -d` bem-sucedido. |
| **Falha durante o deploy** | 🟢 Baixo | `set -euo pipefail` aborta; `restart: always` mantém o container atual. Prune só depois de `up` OK evita remover algo necessário para retry. |
| **Containers antigos em uso** | 🟢 N/A | Só 2 containers, ambos do compose. `--remove-orphans` já cuida de órfãos. Nada acumula. |
| **Imagens compartilhadas por outros serviços** | 🟢 Baixo | Traefik é imagem distinta e sempre rodando. Layers base compartilhados não são removidos enquanto qualquer imagem os referencia. |
| **Tempo de deploy** | 🟢 Baixo | `image prune -f` dangling leva <1 s (só desreferencia). Não afeta o caminho crítico. |
| **Consumo de banda / rebuilds** | 🟢 Baixo | Build é remoto (GHA) com cache de registry. Prune local não força rebuild nem re-download além do pull normal do novo `<sha>`. |
| **Disponibilidade** | 🟢 Baixo (dangling) / 🔴 Alto (`system prune -a` malfeito) | Com dangling-only, zero impacto. Com `system prune -a` durante janela em que o Traefik reinicia, poderia remover a imagem do proxy → outage. **Motivo para NÃO usar `system prune -a` nesses hosts.** |
| **Esgotamento de disco (NONPROD)** | 🔴 Crítico | Já em 72%. Este é o risco dominante e o motivo da urgência. |

---

## 3. Estratégia recomendada (uma só)

**Prune dangling-only inline após deploy bem-sucedido, com um systemd timer semanal como defesa em profundidade, e GHCR como fonte de rollback.** Concretamente, o desenho recomendado (a implementar depois):

1. **No fim do script SSH de deploy, após `docker compose up -d` ter sucesso:**
   `docker image prune -f` (apenas dangling — seguro, idempotente, <1 s).
2. **Um `systemd timer` no host** (semanal em PROD, diário/2× semana em NONPROD) rodando o mesmo `docker image prune -f`, para cobrir deploys manuais e interrupções. Adicionado ao `setup-prod.sh`/`userdata.sh` (reprodutível/IaC).
3. **Guard de concorrência** nos dois workflows: `concurrency: { group: deploy-<env>, cancel-in-progress: false }` para serializar deploys.
4. **Reclaim inicial one-shot** no NONPROD (`docker image prune -f`) para derrubar os 72% imediatamente — etapa manual pontual, fora do fluxo.

**Por que esta e não as alternativas** (comparação exigida):

| Abordagem | Vantagem | Desvantagem / Risco | Veredito |
|---|---|---|---|
| `docker image prune` (dangling) | Seguríssimo; reclama todo o acúmulo (que é dangling); rápido | Não remove tags `<sha>` que porventura fiquem (aqui não ficam) | ✅ **Escolhida** |
| `docker image prune -a --filter until=` | Remove também tagged antigas por idade | Pode remover imagem de rollback quente; precisa de filtro cuidadoso; risco se Traefik parado | 🟡 Opcional (timer, não inline) |
| `docker system prune -a` | Limpa tudo de uma vez | Remove redes/cache e **pode remover Traefik** se parado; risco de outage | ❌ Rejeitada nesses hosts |
| `docker builder prune` | Limpa cache de build | **Inútil aqui**: build é remoto, cache local = 0 B | ❌ Não aplicável |
| Reter últimas N imagens | Rollback quente garantido | Mais complexo (script de ordenação por data); N imagens = N×~80–190 MB | 🟡 Opcional em PROD |
| Limpeza por idade | Previsível | Precisa casar com janela de rollback; sozinha não basta | 🟡 Complemento |
| Só dangling | Máxima segurança | (é a escolhida) | ✅ |
| Via GitHub Actions | Centralizado no CI | GHA só alcança a VPS pelo mesmo SSH → equivale ao inline; **útil apenas para limpar o GHCR** (registry), não o host | 🟡 Para GHCR |
| Via cron | Simples | Menos observável que systemd; sem `OnFailure`/logs estruturados | 🟡 Aceitável |
| Via systemd timer | Logs no journal, `OnFailure`, `Persistent=true` (roda se a VM estava desligada) | Um pouco mais de setup | ✅ **Escolhida p/ defesa em profundidade** |

**Divisão de responsabilidades por camada:**
- **Inline (deploy):** limpa o lixo no instante em que é criado — cobre o caso comum.
- **systemd timer:** rede de segurança para deploys manuais/interrompidos.
- **GHCR retention (GHA):** limita o crescimento do *registry* (separado do host).

---

## 4. Política de retenção recomendada

| Recurso | Política | Justificativa técnica |
|---|---|---|
| **Imagens dangling** | Remover **sempre** (inline + timer) | Nunca têm valor; são 100% do acúmulo aqui; prune dangling é o comando mais seguro do Docker. |
| **Imagens tagged `<sha>` (locais)** | PROD: manter as **últimas 3**; NONPROD: manter a **atual + 1** | Rollback quente. N pequeno porque o GHCR é a fonte real — não precisa de histórico local grande. |
| **Imagens no GHCR (registry)** | Manter **~últimos 30–90 dias** de `<sha>` (via action de retenção) + sempre os `latest` | Fonte de verdade do rollback; janela ampla o suficiente para reverter qualquer release recente sem inflar o registry indefinidamente. |
| **Build cache (host)** | Nenhuma ação | É 0 B — build é remoto. |
| **Build cache (GHA/registry)** | Manter inline cache do `latest` | Acelera builds; custo desprezível. |
| **Containers parados/antigos** | Nenhuma ação nova | Não acumulam (compose recria os 2). |
| **Containers órfãos** | `--remove-orphans` (já existe) | Mantém apenas os serviços do compose atual. |
| **Redes órfãs** | Opcional: `docker network prune -f` no timer | Baixo valor (a rede `proxy` está em uso e é gerida pelo compose); incluir só como higiene do timer. |
| **Volumes** | **NUNCA** auto-prune | `acme.json` é bind-mount (não volume), mas a regra "jamais `--volumes` automático" evita perda de dados irreversível caso um volume seja adicionado no futuro. |

---

## 5. Estratégia de rollback

**Princípio:** rollback é uma operação de *re-deploy de um `<sha>` conhecido a partir do GHCR*, **não** de "restaurar imagem local".

- **Quantas imagens manter?** Localmente: PROD 3, NONPROD 2 (cache quente, opcional). No GHCR: janela de 30–90 dias de `<sha>`. A capacidade de rollback vive no **GHCR**, não no host.
- **Quando podem ser removidas?** Imagens locais podem ser removidas assim que deixam de ser a atual ou a imediatamente-anterior — porque o GHCR ainda as tem. Dangling pode ir a qualquer momento (o container em uso protege a imagem viva).
- **Como evitar que a limpeza inviabilize o rollback?** Três garantias:
  1. Prune **dangling-only** nunca remove a imagem em execução (protegida por referência de container).
  2. O GHCR imutável garante que **qualquer** `<sha>` volta com um `pull` — mesmo que nada exista no host.
  3. Rollback operacional = `workflow_dispatch` com `IMAGE_TAG=<sha-alvo>` (ou script `rollback.sh` que faz `docker compose pull` do `<sha>` + `up -d`). Documentar esse procedimento é parte da correção.
- **Anti-padrão a evitar:** `docker system prune -a` logo após deploy remove a penúltima imagem **e** qualquer coisa não referenciada → rollback passa a exigir re-pull sempre. Aceitável (GHCR existe), mas perde-se o rollback instantâneo. Por isso a política mantém N locais em PROD.

---

## 6. Estratégia para PROD (Hostinger)

- **Prune:** `docker image prune -f` inline após `up -d` + **systemd timer semanal**.
- **Retenção local:** manter últimas **3** `<sha>` (rollback quente — PROD prioriza reversão rápida).
- **Logs:** **manter o `logrotate` existente**; adicionalmente padronizar via `daemon.json` (`max-size=10m`, `max-file=3`) para uniformidade com o nonprod — opcional, baixa prioridade (já protegido).
- **Concorrência:** `concurrency` guard no `app-prod.yml` (serializar).
- **Urgência:** baixa (disco 11%); implementar junto, mas sem pressa.
- **Justificativa:** disco grande + blast radius de produção → priorizar **segurança e rollback** sobre agressividade de limpeza.

---

## 7. Estratégia para NONPROD (OCI)

- **Reclaim imediato (one-shot):** `docker image prune -f` para liberar ~31 GB **antes de tudo** (disco em 72% numa VM de 49 GB). **Ação nº 1.**
- **Prune:** `docker image prune -f` inline + **systemd timer 2×/semana** (cadência de deploy maior).
- **Retenção local:** manter **atual + 1** (rollback importa menos em nonprod; priorizar disco).
- **Logs (faltante):** adicionar `daemon.json` com `log-driver: json-file`, `max-size: 10m`, `max-file: 3` — cobre a ausência de `logrotate` e de limite de log, que hoje não existe aqui.
- **Swap:** adicionar 1–2 GB (VM de 956 MB, 68 MB livres) — reduz risco de OOM durante o pull/build.
- **Concorrência:** `concurrency` guard no `app-nonprod.yml`.
- **Justificativa:** VM pequena, disco pressionado, deploy frequente, sem valor de produção → **limpeza mais agressiva + higiene de host que o prod já tem por acaso**.

**Devem usar a mesma política?** **Não idêntica — mesma base, parâmetros distintos.** O *mecanismo* é o mesmo (dangling prune inline + timer + GHCR para rollback), mas **cadência do timer, N de retenção local e higiene de host divergem** porque os perfis divergem (disco 96 GB vs 49 GB; RAM 8 GB vs <1 GB; prod tem logrotate, nonprod não; rollback crítico só em prod). Padronizar cegamente desperdiçaria a folga do prod ou subprotegeria o nonprod.

---

## 8. Healthcheck — a correção é suficiente?

**`localhost` → `127.0.0.1` é a correção certa para o sintoma, e é robusta** (força IPv4; o Next.js standalone com `HOSTNAME=0.0.0.0` escuta IPv4, enquanto `localhost` no Alpine tende a resolver `::1`/IPv6 → *connection refused*). Recomendo adotá-la no `HEALTHCHECK` do `Dockerfile` e no `healthcheck` dos dois compose.

**Mas é insuficiente como estratégia de saúde**, e aqui está a análise mais robusta:

1. **O healthcheck hoje não governa nada.** O Traefik roteia por *file provider* (`routes.yml`), não pelo estado de health do Docker; e o Docker **não reinicia** containers por `unhealthy` (só por exit + `restart` policy). Ou seja, mesmo preciso, o sinal fica **decorativo** a menos que seja *consumido* por algo.
2. **Camadas recomendadas (defesa em profundidade):**
   - **(a) Precisão** — `127.0.0.1` (liveness interno correto). *Necessário.*
   - **(b) Monitoramento sintético externo** — um uptime monitor (UptimeRobot/BetterStack/healthchecks.io) batendo em `https://ordemnamesa.com.br/api/health` de fora. **É o sinal de maior valor para um SaaS** — mede o caminho real do usuário (DNS→Traefik→app), coisa que o healthcheck interno nunca vê. *Alta prioridade.*
   - **(c) Profundidade do endpoint** — verificar se `/api/health` é *shallow* (200 fixo) ou *deep* (checa Supabase). Para liveness, manter shallow-mas-preciso (evita restart-loop por blip do Supabase). Para readiness/alertas, um endpoint deep separado consumido pelo monitor externo. *Média.*
   - **(d) Enforcement (opcional)** — só depois de (a): se quiser self-healing, usar `autoheal` ou `depends_on: condition: service_healthy`. **Cuidado:** enforcement + healthcheck deep + `restart: always` pode gerar *restart storm* num incidente de dependência. Manter liveness shallow. *Baixa.*

**Veredito:** adotar `127.0.0.1` **e** adicionar monitoramento externo. Só o `127.0.0.1` conserta o falso-negativo, mas não entrega, sozinho, garantia de disponibilidade.

---

## Sequência ideal de implementação (fase de correção — ainda NÃO executar)

Ordenada por risco×urgência, do mais seguro/urgente ao mais opcional:

1. **NONPROD — reclaim imediato:** `docker image prune -f` one-shot (libera ~31 GB, tira o disco de 72%). *Reversível, urgente, isolado.*
2. **Fix do healthcheck** (`127.0.0.1` no Dockerfile + 2 compose). *Baixo risco, alto valor de observabilidade; afeta ambos via mesma imagem.*
3. **`concurrency` guard** nos dois workflows. *Fecha a janela de deploy sobreposto antes de automatizar prune.*
4. **Prune inline** (`docker image prune -f` após `up -d`) nos dois scripts de deploy.
5. **NONPROD — `daemon.json`** com limites de log + **swap** 1–2 GB (adicionar ao `userdata.sh`).
6. **systemd timer** de prune (semanal PROD / 2×semana NONPROD), adicionado a `setup-prod.sh`/`userdata.sh`.
7. **Retenção de GHCR** (action mantendo 30–90 dias de `<sha>`) + **procedimento/documento de rollback**.
8. **(Opcional) PROD `daemon.json`** para uniformizar logs; **monitoramento sintético externo** do `/api/health`.

Cada passo é independente e reversível; validar 1–4 no NONPROD antes de replicar no PROD.

---

## Resumo executivo da revisão

- A estratégia inicial **está no caminho certo, mas era vaga no ponto mais perigoso** (qual prune) e omissa em concorrência, diferenciação de ambiente e na real natureza do healthcheck.
- **Recomendação única:** **`docker image prune -f` (dangling-only) inline após deploy + systemd timer de defesa em profundidade + GHCR como fonte de rollback**, com **parâmetros distintos por ambiente**. Evitar `system prune -a` nesses hosts.
- **Rollback fica seguro** porque o GHCR é imutável e o prune dangling nunca toca a imagem viva; retenção local (3 em prod, 2 em nonprod) é só otimização de velocidade.
- **Healthcheck:** `127.0.0.1` é a correção certa, **mas** só entrega valor real somada a monitoramento externo.
- **Nada foi implementado.** Esta é a validação arquitetural pedida antes da fase de correção.
