# EXECUTION.md — Plano de execução controlada da V1

> Companheiro do [PLAN.md](./PLAN.md). Este documento define **como** chegar lá em commits pequenos, revisáveis, com gates de validação entre eles.
> Filosofia: cada commit lança no `main` algo **provadamente inerte** ou **gated por flag em `off`**. A ativação real é a última coisa que acontece — e não é um deploy de código, é uma flip de env var.

---

## 1. Princípios da execução

1. **Dead-code-first.** Commits 2–6 sobem código em produção que **não roda**. Só compila e existe. Risco zero por construção.
2. **Um responsável por commit.** Cada commit faz uma coisa, é reversível com `git revert <sha>` sem afetar os outros.
3. **Gate por env flag, default OFF.** `NEXT_PUBLIC_PHOTO_TRACE` controla TUDO. Sem flip, o módulo é importado mas seus listeners não inicializam.
4. **Listeners globais nunca rodam antes do commit final.** Provider só registra listeners depois que a flag estiver `on`. Garantido em runtime, não só por convenção.
5. **Validação após cada commit antes de seguir.** Não acumular dívida de validação.

---

## 2. Ordem dos commits (visão)

| # | Commit | O que faz | Estado pós-commit |
|---|---|---|---|
| **C1** | Fase 0 — `revokeObjectURL` | Fix de leak isolado | ✅ Atua em produção (sem flag) |
| **C2** | `lib/photo-trace.ts` (dead code) | Módulo existe, exporta `bc/boot/noop` | 💤 Importável, nada o usa |
| **C3** | `app/api/photo-trace/route.ts` | Endpoint vivo, sem callers | 💤 Rota responde 204, ninguém chama |
| **C4** | `components/photo-trace-provider.tsx` (não montado) | Provider compilado | 💤 Não está no tree |
| **C5** | `app/debug/photo-trace/page.tsx` | Página acessível | ✅ Renderiza localStorage vazio |
| **C6** | Montar provider em `app/layout.tsx` (flag OFF) | Provider monta mas detecta flag e retorna sem listeners | 💤 Provider monta, `boot()` é no-op |
| **C7** | Hooks `bc()` em PhotoUpload + storage.ts (gated) | Integration completa mas `bc()` é no-op com flag OFF | 💤 Calls existem, viram no-op |
| **C8** | **Ativação:** `NEXT_PUBLIC_PHOTO_TRACE=on` em ambiente | Sem código novo — só env flip + redeploy | 🟢 Vivo |

**Razão da ordem:** cada commit é um andar do prédio. C1 é isolado. C2-C5 são tijolos soltos. C6 conecta o tijolo (mas a luz está apagada). C7 liga os fios (luz ainda apagada). C8 acende a luz.

**Rollback simples:** revert do último commit volta o sistema a um estado provadamente bom.

---

## 3. Detalhe de cada commit

### Commit 1 — Fase 0: revokeObjectURL cleanup

- **Objetivo:** corrigir vazamento de blob URL em `tarefa/[id]/page.tsx`. Independente da instrumentação.
- **Arquivos:** [`app/(app)/turno/tarefa/[id]/page.tsx`](app/(app)/turno/tarefa/[id]/page.tsx) — apenas adicionar `useEffect` cleanup.
- **Linhas:** +5.
- **Risco:** muito baixo. API documentada do MDN, escopo local.
- **Validação:**
  - `npm run build` passa.
  - Smoke local: tirar foto, ver preview, sair da tela → DevTools → Memory → Heap snapshot → confirma que o blob URL anterior foi liberado.
  - Visual: nada muda na UI.
- **Rollback:** `git revert <sha>`. Independente.
- **Pode ir pra produção sozinho?** Sim.

---

### Commit 2 — Módulo dead code

- **Objetivo:** introduzir `lib/photo-trace.ts` com a estrutura completa, mas sem que nada do app importe ou execute.
- **Conteúdo:**
  - Tipo `Breadcrumb`.
  - Função `bc(event, meta?)`.
  - Função `boot()`.
  - Função `diagnose()`.
  - Função `safeMeta()`.
  - Sanitize whitelist.
  - Listeners e heartbeat **declarados em `boot()`**, ainda não chamados.
  - Constante `IS_ENABLED = process.env.NEXT_PUBLIC_PHOTO_TRACE === 'on'`.
  - **Toda função pública verifica `IS_ENABLED` na entrada e retorna no-op se OFF.**
- **Arquivos:** [`lib/photo-trace.ts`](lib/photo-trace.ts) (novo).
- **Linhas:** ~160.
- **Risco:** muito baixo — ninguém importa.
- **Validação:**
  - `npm run build` passa (TS válido, sem unused-import errors).
  - `grep -r "photo-trace" app/ components/` retorna apenas o próprio arquivo.
  - Bundle analyzer (`@next/bundle-analyzer` se instalado, senão skip): módulo não aparece em nenhum chunk de cliente porque ninguém importa.
- **Rollback:** delete do arquivo.
- **Heisenbug check:** zero — código não roda em ninguém.

---

### Commit 3 — Endpoint dummy

- **Objetivo:** rota `POST /api/photo-trace` que valida tamanho e `console.log`a per-breadcrumb.
- **Arquivos:** [`app/api/photo-trace/route.ts`](app/api/photo-trace/route.ts) (novo).
- **Linhas:** ~25.
- **Risco:** baixo. Rota nova, sem callers ainda.
- **Validação:**
  - `npm run build` passa.
  - Local: `curl -X POST http://localhost:3000/api/photo-trace -H 'Content-Type: application/json' -d '{"s":"abc","ua":"test","bcs":[{"n":0,"t":1,"e":"boot"}]}'` → 204.
  - Logs do server mostram linhas no formato `[pt] s=abc ...`.
  - `curl` com payload > 64KB → 413.
  - `curl` com body inválido → 400.
- **Rollback:** delete do arquivo de rota.
- **Heisenbug check:** zero — nada chama.

---

### Commit 4 — Provider component (não montado)

- **Objetivo:** componente provider declarado e exportado, **não montado em lugar nenhum**.
- **Arquivos:** [`components/photo-trace-provider.tsx`](components/photo-trace-provider.tsx) (novo).
- **Linhas:** ~20.
- **Conteúdo:**
  ```tsx
  'use client';
  import { useEffect } from 'react';
  import { boot } from '@/lib/photo-trace';
  export function PhotoTraceProvider() {
    useEffect(() => { boot(); }, []);
    return null;
  }
  ```
- **Risco:** baixo. Compila, não é renderizado.
- **Validação:**
  - `npm run build` passa.
  - `grep -r "PhotoTraceProvider" app/` → apenas o arquivo.
- **Rollback:** delete.
- **Heisenbug check:** zero.

---

### Commit 5 — Debug page

- **Objetivo:** página `/debug/photo-trace` que lê localStorage e mostra JSON.
- **Arquivos:** [`app/debug/photo-trace/page.tsx`](app/debug/photo-trace/page.tsx) (novo) + opcional `robots` meta no head.
- **Linhas:** ~55.
- **Conteúdo:**
  - `'use client'`.
  - `useEffect` lê `photo_trace:cur`, `photo_trace:prev`, `photo_trace:hb`, `photo_trace:inflight`.
  - Renderiza `<pre>{JSON.stringify(..., null, 2)}</pre>`.
  - Botão "Copiar" (clipboard API).
  - Botão "Enviar agora" (fetch ao endpoint).
  - `<meta name="robots" content="noindex" />` no head.
- **Risco:** muito baixo. Página isolada. Não expõe nada além do localStorage do próprio device.
- **Validação:**
  - Acessar `http://localhost:3000/debug/photo-trace` → mostra "buffer vazio".
  - Setar manualmente `localStorage.setItem('photo_trace:cur', JSON.stringify([{n:0,t:1,e:'test'}]))` no DevTools → recarrega → vê o JSON.
  - Clicar "Copiar" → clipboard contém o JSON.
  - Clicar "Enviar agora" → request ao `/api/photo-trace` → server log mostra.
- **Rollback:** delete da pasta.
- **Heisenbug check:** zero — página acessada manualmente, fora do fluxo de foto.

---

### Commit 6 — Montar provider no layout (flag OFF na intenção)

- **Objetivo:** `<PhotoTraceProvider />` no `app/layout.tsx`. Como `boot()` checa `IS_ENABLED` e retorna no-op, o provider monta mas não faz nada.
- **Arquivos:** [`app/layout.tsx`](app/layout.tsx) — +2 linhas (import + `<PhotoTraceProvider />`).
- **Linhas:** +2.
- **Risco:** baixo — provider já existe (C4), `boot()` é guarded.
- **Validação:**
  - `npm run build` passa.
  - Local sem env var setada: abrir app, qualquer página → DevTools → Application → Local Storage **vazio** (nenhum `photo_trace:*`).
  - DevTools → Console: zero log de instrumentação.
  - DevTools → Performance: gravar 5s carregando uma página → nenhum tempo medido no `boot()` (porque sai imediato no guard).
  - DevTools → Network: nenhum POST a `/api/photo-trace`.
  - Setar `NEXT_PUBLIC_PHOTO_TRACE=on` localmente (`.env.local`), rebuild dev, abrir app → localStorage agora tem `photo_trace:cur` com 1 entry `boot`.
  - Reverter env var local.
- **Rollback:** remover as 2 linhas do layout. Sem afetar outros commits.
- **Heisenbug check:** crucial. Com flag OFF em prod, **zero impacto**. Validar isso é o ponto desse commit.

---

### Commit 7 — Integration calls (gated)

- **Objetivo:** adicionar `bc()` calls em `PhotoUpload` e `storage.ts`. Como `bc()` checa `IS_ENABLED`, todas viram no-op com flag OFF.
- **Arquivos:**
  - [`components/tasks/photo-upload.tsx`](components/tasks/photo-upload.tsx): +6 linhas (chamadas em mount/unmount/click/chg/up:s/up:end).
  - [`lib/supabase/storage.ts`](lib/supabase/storage.ts): +3 linhas (set/clear `photo_trace:inflight` no try/finally do upload).
  - [`app/(app)/turno/tarefa/[id]/page.tsx`](app/(app)/turno/tarefa/[id]/page.tsx): +3 linhas (chamadas no fluxo alternativo).
- **Linhas:** +12 totais.
- **Risco:** **médio** — agora estamos tocando no path de produção do upload. Cuidado especial:
  - `bc()` é guarded e síncrona, mas deve ser **chamada DEPOIS** das mudanças de state, não antes — evitar afetar ordering de re-renders.
  - O marker `inflight` em `storage.ts` precisa estar em `try/finally`, **sem** alterar o erro propagado.
  - Nenhum `await` adicionado ao caminho do upload.
- **Validação:**
  - `npm run build` passa.
  - Flag OFF, fluxo de foto local: comportamento idêntico ao baseline (capturar, ver preview, upload, sucesso). Tempo de upload sem regressão perceptível.
  - DevTools → Performance: gravar fluxo de foto. Comparar com baseline antes do commit (gravar antes de mergear C7). Δ deve ser < 5ms total.
  - Flag ON local: fluxo funciona, localStorage popula, eventos `chg`, `up:s`, `up:end` aparecem.
  - Forçar erro de upload (DevTools → Network → Offline durante upload): `up:end` com `ok:false` é logado.
- **Rollback:** revert do commit volta as 12 linhas. Nenhum efeito colateral porque tudo era gated.
- **Heisenbug check:** **este é o commit mais delicado.** Validar latência do upload com flag ON vs OFF antes de seguir.

---

### Commit 8 — Ativação (não é commit de código)

- **Objetivo:** flip de `NEXT_PUBLIC_PHOTO_TRACE` de `off` para `on` no painel do host (Vercel/etc) + redeploy.
- **Arquivos:** nenhum. Só env var.
- **Linhas:** 0.
- **Risco:** baixo se C1–C7 validados. Reversão: flip de volta.
- **Validação:**
  - Pós-deploy, abrir app em modo anônimo no celular → DevTools remoto (chrome://inspect) → localStorage tem `photo_trace:cur` com evento `boot`.
  - Endpoint server log: aparece `[pt] s=... reason=pagehide` quando fecho a aba.
  - Erro rate em prod nas próximas 2h: sem aumento.
- **Rollback:** env var de volta pra `off` + redeploy (5min). Ou para `internal` se quiser restringir.

---

## 4. Estratégia de ativação gradual (resumo dos 5 estados)

```
estado 0 (pré-V1):       app sem instrumentação                               (hoje)
estado 1 (após C1):      app com fix de leak                                  ✅ prod
estado 2 (após C2-C5):   código carregado mas inerte                          ✅ prod
estado 3 (após C6):      provider montado, no-op por flag                     ✅ prod
estado 4 (após C7):      integration completa, no-op por flag                 ✅ prod
estado 5 (após C8):      instrumentação ativa                                 🟢 ativa
```

Entre cada estado pode haver dias de espera observando. Não há pressão pra correr.

---

## 5. Validação por etapa (resumo prático)

### Após cada commit, antes de seguir
- [ ] `npm run build` passa sem warning novo.
- [ ] `npm run lint` passa.
- [ ] Smoke manual local: abrir app, navegar 3 telas, sem console error novo.

### Depois de C6 (provider montado, flag OFF)
- [ ] DevTools Console: zero log de `[photo-trace]`.
- [ ] DevTools Application > Local Storage: zero chave `photo_trace:*`.
- [ ] DevTools Network: zero request a `/api/photo-trace`.
- [ ] DevTools Performance: gravar carregamento → `boot()` não aparece (sai no guard).

### Depois de C7 (integration, flag OFF)
- [ ] Comparar **latência de upload** flag OFF vs baseline (mesmo device, mesma foto):
  - Medir tempo entre `onChange` → `setUploading(false)`.
  - Δ aceitável: < 10ms.
- [ ] DevTools Memory: heap snapshot antes/depois de 5 uploads. Δ aceitável: < 1MB.
- [ ] Fluxo visual idêntico ao baseline.

### Depois de C8 (ativação)
- [ ] Em prod, abrir app, fazer fluxo de foto.
- [ ] Server logs mostram `[pt]` lines com sessionId.
- [ ] `/debug/photo-trace` mostra eventos da sessão atual.
- [ ] Próxima sessão (recarregar app): boot loga `verdict: clean_nav`.
- [ ] Erro rate de Sentry/logs sem spike.

---

## 6. Estratégia anti-heisenbug

Como garantir que a instrumentação não distorce o problema.

| Vetor de risco | Controle |
|---|---|
| Timing do upload | C7 mede Δ latência flag ON vs OFF. Aborta se > 10ms. |
| Memory pressure adicional | Writes localStorage **só em eventos críticos** (já no PLAN §7 corrigido). Stringify pequeno. |
| GC spikes | `bc()` aloca 1 objeto pequeno por call (~200B). Pool não necessário. |
| Lifecycle alterado | Provider retorna `null`, nunca cria DOM. Listeners são `addEventListener({passive: true})` quando aplicável. |
| Re-render do React | `bc()` nunca toca state React. Provider só tem `useEffect([], boot)`. |
| Ordem de eventos | `bc()` é chamado **após** as mudanças de state do PhotoUpload, nunca antes. |
| Throwing errors | Toda `bc()` envolvida em `try/catch` silencioso. Falha de instrumentação **nunca** propaga ao app. |
| Quota exceeded | Try/catch no `setItem` cai pra in-memory only. |
| StrictMode duplicação (dev) | Aceitar duplicatas; documentar; em prod não acontece. |

**Linha mestra:** se ON e OFF não forem indistinguíveis em latência/memória, pausa antes de C8.

---

## 7. Estratégia de observação inicial (antes de ativar pra usuário)

No próprio device do dev (Android Chrome — emprestar/usar device low-end se possível):

1. **Baseline:** com flag OFF, gravar Performance trace de 1 fluxo completo de foto.
2. **ON local:** flip env var, mesmo fluxo, mesma foto. Gravar trace.
3. Comparar lado a lado: scripting time, render time, layout time. Δ deve ser invisível.
4. localStorage após o fluxo: contém ≤ 10 entries, tamanho ≤ 5KB.
5. Forçar `pagehide` (fechar aba): `chrome://net-export` ou DevTools Network → verificar request a `/api/photo-trace`.
6. Reabrir app: novo evento `boot` aparece, `verdict` correto (`clean_nav` no caso).
7. Simular discard (`chrome://discards`): reabrir → `verdict: discard`.
8. Simular crash (DevTools triple-dot → "Crash tab"): reabrir → `verdict: crash_or_kill` ou `crash_during_upload` (se ocorreu durante upload).
9. Auditoria manual: ver 10 payloads via debug page ou server logs. Zero PII, zero signed URL.

Critério de avanço: tudo acima funciona como esperado.

---

## 8. Estratégia de rollback (em níveis)

Rollback é a melhor feature de qualquer plano. Disponível em **4 níveis**, do mais barato pro mais drástico:

| Nível | Mecanismo | Tempo | Quando usar |
|---|---|---|---|
| **L0** | Flag env `off` + redeploy | 5min | Qualquer ruído inesperado pós-C8 |
| **L1** | Flag env `off` permanente (após bug fixado) | 5min | Manter código no repo, só desligar |
| **L2** | Revert do commit problemático | 10min | Bug na própria instrumentação |
| **L3** | Revert de C2-C8 (deixando só C1) | 20min | Abandonar V1 inteira |

L0 e L1 não exigem revisão de código. L2-L3 vão por PR padrão.

---

## 9. Estratégia de isolamento (boundaries)

| Boundary | Garantia |
|---|---|
| `lib/photo-trace.ts` não importa nada do app | Só `@/lib/photo-trace` é cliente. Não importa Supabase, Zustand, React Query. |
| Não toca state React | `bc()` fora de qualquer árvore. Provider só `useEffect`. |
| Não acopla com upload | `storage.ts` faz `localStorage.setItem('photo_trace:inflight', ...)` direto — sem importar o módulo. 3 linhas inline. (Reduz coupling.) |
| Não acopla com auth | Endpoint `/api/photo-trace` **não exige token** na V1 — payload já é sanitizado, sem PII. Se preferir auth, adicionar depois sem refatorar nada. |
| Não cria dependência cíclica | Módulo é leaf — ninguém importa quem importa. |

**Decisão acoplamento Supabase:** o marker `inflight` em `storage.ts` é 3 linhas de `localStorage.setItem`/`removeItem` direto, sem importar `photo-trace.ts`. Garante que `storage.ts` continua testável e independente.

---

## 10. Checklist final antes de C8 (ativar em produção)

- [ ] C1–C7 deployados em produção há ≥ 24h sem regressão observada.
- [ ] Erro rate em produção (Sentry/logs) estável vs semana anterior.
- [ ] Smoke local em Chrome Android Δ latência ON vs OFF < 10ms.
- [ ] Smoke local em Chrome Android Δ heap ON vs OFF < 1MB.
- [ ] Auditoria manual de 10 payloads em `/debug/photo-trace`: zero PII, zero URL.
- [ ] Server logs do endpoint funcionam (linhas `[pt]` aparecem, grepáveis por sessionId).
- [ ] `verdict` correto em cada simulação local (reload, discard, crash, clean_nav).
- [ ] Rollback L0 testado: flip pra `off`, refresh, instrumentação some.
- [ ] Pessoa de suporte sabe instruir o usuário sobre `/debug/photo-trace` + botão Copiar.

Quando tudo checked → flip env var em prod. Não antes.

---

## 11. Após C8 — coleta e diagnóstico

(Já coberto no PLAN.md §10. Resumo: pedir reprodução, coletar 1-3 sessões, analisar `verdict` + breadcrumbs, classificar hipótese, abrir PLAN.md do fix.)

---

## 12. Resumo executivo (1 parágrafo)

Oito commits. C1 é fix isolado, vai sozinho. C2-C5 sobem código **dead** que não roda. C6 monta o provider mas a flag está OFF, nada acontece. C7 conecta a instrumentação ao fluxo da câmera, mas `bc()` continua no-op com flag OFF. Cada commit nesse intervalo é provadamente inerte e revertível isoladamente. C8 é só uma flip de env var — sem código. Entre C7 e C8, validamos exaustivamente latência, memória e ausência de side-effects. Rollback disponível em 4 níveis, do mais barato (env flip) ao mais drástico (revert). Heisenbug controlado por: writes localStorage só em eventos críticos, `bc()` sempre guarded, zero toque em state React, zero `await` adicionado ao path do upload.

Pronto pra começar por C1.
