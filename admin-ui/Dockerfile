# ── Stage 1: deps ──────────────────────────────────────────────
# Install ALL dependencies (including devDeps needed by the Next.js build:
# TypeScript, ESLint, SWC compiler etc.) using npm ci for reproducibility.
# libc6-compat is required by the Next.js SWC binary on Alpine (musl libc).
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm install

# ── Stage 2: builder ────────────────────────────────────────────
# Copies node_modules from deps (no second install) and compiles the app.
# The full node_modules (including devDeps) is needed here for tsc/SWC.
# This entire stage is discarded after the build — only the output is kept.
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG INTERNAL_API_URL=http://api:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL

# Produces .next/standalone — a self-contained server with only the
# subset of node_modules actually imported at runtime.
RUN npm run build

# ── Stage 3: runner ─────────────────────────────────────────────
# Minimal Alpine runtime — no npm, no build tools, no source code.
# The standalone output already contains the pruned node_modules it needs.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public                                ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
