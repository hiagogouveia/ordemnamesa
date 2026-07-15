# =============================================================================
# Stage 1: deps — instala dependências de produção e desenvolvimento
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copiar apenas os arquivos de dependências para aproveitar cache de camadas
COPY package.json package-lock.json ./

RUN npm ci

# =============================================================================
# Stage 2: builder — compila o Next.js com output standalone
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variáveis de build injetadas pelo CI (valores públicos apenas)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PHOTO_TRACE=
ARG NEXT_PUBLIC_SUPPORT_EMAIL=

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_PHOTO_TRACE=${NEXT_PUBLIC_PHOTO_TRACE}
ENV NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Bundle do worker de jobs (dist/worker.cjs). O standalone do Next só traça o grafo da
# app; o worker precisa do seu próprio bundle. `packages: external` deixa as deps fora do
# bundle — elas vêm do node_modules do standalone (o worker usa as MESMAS libs da app:
# supabase-js etc., que o Next já inclui).
RUN npm run build:worker

# =============================================================================
# Stage 3: runner — imagem final mínima para produção
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Usuário não-root para segurança
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar artefatos do build standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Worker de jobs: só o bundle. As libs de runtime (supabase-js etc.) o worker resolve do
# node_modules do STANDALONE (já copiado acima) — são as MESMAS que a app usa, então o
# Next já as incluiu. Nada de copiar node_modules cheio: mataria o ganho do standalone.
# O worker roda no MESMO container/imagem, via `command: node dist/worker.cjs` no compose.
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

USER nextjs

EXPOSE 3000

# Usa 127.0.0.1 (IPv4) em vez de localhost: no Alpine, localhost pode resolver
# para ::1 (IPv6), mas o Next.js standalone escuta apenas IPv4 (HOSTNAME=0.0.0.0),
# gerando falso-negativo "unhealthy". 127.0.0.1 força IPv4 e reflete a saúde real.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
