# ── Stage 1: install deps ────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Skip Puppeteer's bundled Chrome — we use system Chromium in the runner stage
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Tell Puppeteer to use system Chromium rather than its own download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Upgrade all packages first to pick up security patches, then install deps.
#
# Cache-bust: BuildKit/GHA cache keys this RUN on its instruction text alone,
# not wall-clock time — a layer cached before an upstream CVE fix was
# published will keep being reused (and keep serving the vulnerable package)
# indefinitely otherwise. Bump ARG's value whenever Trivy's scan step flags a
# "fixed" OS-level CVE that a plain re-run doesn't clear.
ARG APK_CACHE_BUST=2026-10-10-node22-openssl-util-linux
RUN echo "cache-bust: ${APK_CACHE_BUST}" && \
    apk upgrade --no-cache && \
    apk add --no-cache postgresql-client chromium nss freetype harfbuzz ca-certificates ttf-freefont && \
    # CMD and every CronJob run `node ...` — this image never invokes
    # npm/npx/corepack at runtime, but the base image ships them with their
    # own bundled deps (pacote, picomatch, brace-expansion...) that Trivy
    # flags independently of our package.json. Same approach as
    # scraper/Dockerfile: remove the unused CLI rather than ignore its CVEs.
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs -h /home/nodeapp nodeapp && \
    mkdir -p /home/nodeapp/db-backups && \
    chown -R nodeapp:nodejs /home/nodeapp

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY scripts ./scripts
COPY package.json ./

USER nodeapp
EXPOSE 4000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "src/index.js"]
