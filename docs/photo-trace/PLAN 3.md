# PLAN.md — Instrumentação mínima do crash de foto (V1)

> Plano enxuto. Não construir plataforma de observabilidade — construir o mínimo que dá evidência sobre **um** crash em **um** usuário.

---

## 1. Objetivo

Descobrir **com evidência** o que mata o navegador mobile no momento em que o usuário confirma uma foto. Hoje só temos vídeo do usuário — precisamos do "último evento antes da morte" no device dele.

### Hipóteses principais a distinguir
- **H1 — OOM** (SO mata o processo do browser).
- **H2 — Tab discard** (Chrome libera RAM, aba é recriada).
- **H3 — Unmount** do `PhotoUpload` durante upload (key dinâmica em `ExecutionItem`).
- **H4 — Upload error** silencioso.
- **H6 — In-app webview** (Instagram/WhatsApp) fechando.

Para cada uma, precisamos de um sinal claro nos breadcrumbs.

---

## 2. Filosofia

- **Não é uma plataforma.** É um pedaço de cola entre `localStorage` e um endpoint que `console.log`a no server.
- **Menos arquivos = menos bug.** Tudo num módulo só, sem sub-módulos.
- **Servidor já tem log driver** (Vercel/host). Não precisamos de tabela.
- **1 usuário, não milhões.** Sem rate limit, sem RLS, sem retenção, sem dashboards.
- **Removível em 1 PR** quando o bug for fechado.

---

## 3. Escopo V1

Apenas três coisas:

1. **Fase 0** — `revokeObjectURL` cleanup em `tarefa/[id]/page.tsx` (5 linhas, isolado).
2. **Instrumentação mínima** — buffer em `localStorage` + listeners de lifecycle + 8 chamadas `bc()` no fluxo da câmera.
3. **Captura do último estado antes da morte** — no boot da próxima sessão, lê o buffer da sessão anterior, classifica, envia via `sendBeacon` pro endpoint dummy.

Nada além disso.

---

## 4. Arquitetura mínima

```
PhotoUpload  →  bc('chg' / 'up:s' / 'up:ok' / 'up:err' / 'unmount')
                   │
                   ▼
        lib/photo-trace.ts  (UM arquivo)
        ├─ ring buffer in-memory
        ├─ write síncrono em localStorage
        ├─ listeners (visibility/pagehide/pageshow/error)
        ├─ heartbeat 2s
        ├─ boot: lê sessão anterior, classifica, sendBeacon
        └─ sanitize inline (whitelist de chaves)
                   │
                   ▼
        POST /api/photo-trace    ──→  console.log no server
                                       (log driver do host = "database")

Usuário/suporte: abrir /debug/photo-trace → ver JSON → Copiar
```

**Sem** tabela Supabase. **Sem** migration. **Sem** RLS. **Sem** admin UI com filtros. **Sem** rate limit. **Sem** feature flag por restaurante. **Sem** retention job. **Sem** sub-módulos.

---

## 5. Estrutura de arquivos final

### Novos (4)
| Arquivo | Linhas aprox | Responsabilidade |
|---|---|---|
| [`lib/photo-trace.ts`](lib/photo-trace.ts) | ~150 | Tudo: bc, buffer, listeners, heartbeat, boot, diagnose, sanitize, beacon |
| [`components/photo-trace-provider.tsx`](components/photo-trace-provider.tsx) | ~15 | `'use client'` + `useEffect(() => boot(), [])`, renderiza null |
| [`app/api/photo-trace/route.ts`](app/api/photo-trace/route.ts) | ~15 | `POST` que valida tamanho e `console.log`a o body |
| [`app/debug/photo-trace/page.tsx`](app/debug/photo-trace/page.tsx) | ~50 | Lê localStorage, mostra JSON, botão Copiar, botão Enviar agora |

### Existentes tocados (3)
| Arquivo | Mudança | Linhas |
|---|---|---|
| [`app/layout.tsx`](app/layout.tsx) | incluir `<PhotoTraceProvider />` | +2 |
| [`components/tasks/photo-upload.tsx`](components/tasks/photo-upload.tsx) | 6 chamadas `bc()` | +6 |
| [`app/(app)/turno/tarefa/[id]/page.tsx`](app/(app)/turno/tarefa/[id]/page.tsx) | Fase 0 (revokeObjectURL) + 3 chamadas `bc()` | +8 |

**Total: 4 arquivos novos, 3 tocados, ~260 linhas adicionadas.**

---

## 6. Eventos mínimos

Apenas os que distinguem entre as hipóteses:

| Code | Onde | Distingue |
|---|---|---|
| `boot` | Provider monta | Mostra `wasDiscarded`, `navType`, verdict da sessão anterior |
| `vis` | `visibilitychange` | Tab background (precursor de discard/OOM) |
| `hide` | `pagehide` | Saída limpa vs crash (presença/ausência) |
| `show` | `pageshow` | `persisted` = BFCache |
| `mount` | PhotoUpload monta | Início do fluxo |
| `unmount` | PhotoUpload desmonta | Confirma H3 |
| `chg` | input `onChange` | Foto chegou; loga `size`/`type` |
| `up:s` | upload start | Antes do `fetch` |
| `up:ok` | upload sucesso | — |
| `up:err` | upload erro | Confirma H4 |
| `err:js` | window error | Erros JS globais |
| `hb` | heartbeat 2s | "estava vivo até aqui" — núcleo da detecção de OOM |

**12 codes, suficiente.** Outros eventos (freeze/resume/click/sign:*) → só se V1 não bastar.

---

## 7. Persistência mínima

```
localStorage:
  photo_trace:cur   — buffer da sessão atual (array JSON, máx 200 entries)
  photo_trace:prev  — buffer da sessão anterior (renomeado no boot)
  photo_trace:hb    — { s, t } atualizado a cada 2s
```

**Mecânica:**
- `bc()` empurra no ring buffer in-memory + escreve `JSON.stringify(buffer)` em `photo_trace:cur` síncrono.
- Heartbeat: `setInterval(2000)` reescreve `photo_trace:hb`.
- `pagehide`: tenta `sendBeacon('/api/photo-trace', JSON.stringify({ s, ua, bcs, reason: 'pagehide' }))`.
- Boot:
  1. Renomeia `cur → prev` (ou loga "no previous session" se vazio).
  2. Lê `prev` + `hb` + `document.wasDiscarded`.
  3. Classifica (ver §8).
  4. Faz `sendBeacon` do `prev` com o `verdict`.
  5. Limpa `prev`.

**Tamanho:** ring buffer cap 200 entries × ~200 bytes = ~40KB. Folga total em localStorage 5MB.

**Quota exceeded:** try/catch ao redor de `setItem` → cai pra in-memory-only sem crashar.

---

## 8. Diagnose mínimo

```ts
// pseudocódigo — 20 linhas no boot()
function diagnose(prev: Breadcrumb[], hb: { s, t } | null): string {
  if (!prev || prev.length === 0) return 'no_prev';
  if (document.wasDiscarded) return 'discard';
  const last = prev[prev.length - 1];
  const hadHide = prev.some(b => b.e === 'hide');
  const navType = performance.getEntriesByType('navigation')[0]?.type;

  if (navType === 'reload') return 'reload';
  if (hadHide) return 'clean_nav';
  if (hb && Date.now() - hb.t > 5000) return 'oom_likely';   // heartbeat parou
  if (last.e === 'up:s' || last.e === 'chg') return 'crash_during_upload';
  if (last.e === 'unmount') return 'unmount';
  return 'unknown';
}
```

**Sem engine de regras, sem state machine.** Uma função pura de ~20 linhas. Logada no evento `boot`.

---

## 9. Segurança mínima

Sanitizer = **whitelist por event code**, inline na `bc()`:

```ts
const ALLOWED_META: Record<string, string[]> = {
  chg:    ['size', 'type'],
  'up:s': ['size', 'type'],
  'up:ok': ['durationMs'],
  'up:err': ['errName', 'errMsg'],
  mount:  ['taskId'],
  unmount:['taskId'],
  vis:    ['state'],
  hide:   ['persisted'],
  show:   ['persisted'],
  boot:   ['wasDiscarded', 'navType', 'deviceMemory', 'uaShort', 'verdict'],
  'err:js': ['msg', 'src'],
};

function safeMeta(event: string, meta?: object) {
  const allowed = ALLOWED_META[event] ?? [];
  const out: any = {};
  for (const k of allowed) {
    const v = (meta as any)?.[k];
    if (typeof v === 'string') out[k] = v.slice(0, 100);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
```

Tudo que não está na whitelist do event code **simplesmente não é logado**. Sem regex de blacklist. Sem detecção de JWT. Whitelist é suficiente porque a chamada-site nunca passa esses dados.

**Truncamento:** strings limitadas a 100 chars. UA truncado a 80 chars no boot.

**Nunca logar:** File, Blob, ArrayBuffer, signed URL, path do storage, email, nome, token. Pela whitelist, nenhum desses pode entrar.

---

## 10. Rollout mínimo

1. **PR único** com Fase 0 + V1 completa.
2. **Deploy 1:** `NEXT_PUBLIC_PHOTO_TRACE=off`. CI verde. Smoke test: abrir app, nada acontece.
3. **Deploy 2:** `NEXT_PUBLIC_PHOTO_TRACE=on`. Você abre no seu device, confirma que server log mostra POST.
4. **Auditoria manual:** ler ~10 POSTs do server log, confirmar zero PII.
5. **Pedir reprodução ao usuário afetado:**
   - "Abre o app, faz o fluxo do bug, depois abre `/debug/photo-trace` e clica em Copiar. Cola pra gente."
   - Em paralelo, o `sendBeacon` no `pagehide` da próxima sessão também envia automaticamente — temos duas chances.
6. **Análise** com 1-3 reproduções. Confirma hipótese.
7. **Quando fixar:** flip `=off`, ainda no código. Remove em PR separada após 14d estável.

**Kill switch:** uma variável de ambiente. ~5min via redeploy.

---

## 11. Validação mínima

Antes de habilitar `on` em produção:

- [ ] `npm run build` passa.
- [ ] Chrome desktop: fluxo de foto → server log mostra POST com breadcrumbs no `pagehide`.
- [ ] Chrome DevTools → Application → Local Storage: `photo_trace:cur` populado.
- [ ] Forçar reload da página → próxima boot loga `verdict: 'reload'`.
- [ ] Chrome DevTools → "Crash tab" (triple-dot menu) → reabrir → boot loga `verdict: 'oom_likely'`.
- [ ] `chrome://discards` → discard a aba → reabrir → boot loga `verdict: 'discard'`.
- [ ] Ler 10 POSTs no server log, conferir manualmente: zero email, zero URL, zero token.
- [ ] Acessar `/debug/photo-trace` logado: vê JSON + botão Copiar funciona.

**Não validar:** Samsung Internet, WhatsApp WebView, iOS Safari < 15. Aceita-se cobertura parcial nesta fase.

---

## 12. O que NÃO entra agora

- Tabela `photo_traces` no Supabase.
- Migration + RLS.
- Página admin server-side com filtros.
- Feature flag por restaurante (`feature_flags` jsonb).
- Rate limiting no endpoint.
- Retention job / cleanup automático.
- `freeze`/`resume` listeners.
- `unhandledrejection` listener (a `err:js` cobre o essencial).
- `fetch keepalive` fallback pra iOS antigo.
- `performance.memory` snapshots (adicionar só se H1 não ficar claro).
- Blacklist de patterns (whitelist já basta).
- Unit tests sofisticados do sanitizer (manual check suficiente).
- Sub-módulos (`buffer.ts`, `listeners.ts`, `sanitize.ts`, etc.) — tudo em `photo-trace.ts`.
- Schema versioning (`v: 1`).
- Cross-browser matrix.
- RUNBOOK.md separado — 1 parágrafo no top do `photo-trace.ts` basta.
- Compressão, retry, IndexedDB, Service Worker, Sentry, qualquer SDK.

---

## 13. Estimativa

- **Arquivos novos:** 4
- **Arquivos tocados:** 3
- **Linhas adicionadas:** ~260
- **Tempo de implementação:** 4h
- **Tempo de validação:** 1h
- **Risco de regressão:** muito baixo (toda mudança é aditiva, encapsulada e gated por env flag)
- **Esforço de remoção futura:** ~30min (1 PR deletando 4 arquivos + 13 linhas em 3 existentes)

---

## 14. Ordem de execução

1. **Fase 0** — `revokeObjectURL` em `tarefa/[id]/page.tsx`. Commit 1.
2. `lib/photo-trace.ts` — escrever o módulo inteiro de uma vez (buffer + listeners + heartbeat + boot + diagnose + sanitize + beacon). Commit 2.
3. `app/api/photo-trace/route.ts` + `components/photo-trace-provider.tsx`. Commit 3.
4. Integrar `<PhotoTraceProvider />` em `app/layout.tsx`. Commit 4.
5. Adicionar chamadas `bc()` em `photo-upload.tsx` e `tarefa/[id]/page.tsx`. Commit 5.
6. `app/debug/photo-trace/page.tsx`. Commit 6.
7. Smoke test local (Chrome desktop + DevTools mobile emulation).
8. `npm run build`. PR.
9. Deploy com flag `off`. Validar build em prod.
10. Flip flag `on`. Auditoria manual de PII em 10 POSTs.
11. Solicitar reprodução ao usuário.
12. Análise + próximo PLAN.

---

## 15. Critérios de sucesso (definition of done para a V1)

- ≥ 1 sessão real do usuário afetado capturada com `verdict` classificado.
- Conseguimos apontar com confiança qual hipótese (H1-H6) está acontecendo.
- Zero PII vazada em qualquer payload (auditoria manual).
- Zero crash novo introduzido pela instrumentação (monitorar erro rate por 48h pós-rollout).
- Kill switch funciona.

Quando todos checked → este plano cumpriu sua missão. Próximo plano: o fix do bug real.
