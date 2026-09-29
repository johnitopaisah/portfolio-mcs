# ── Stage 1: install deps ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Same caching trap as APK_CACHE_BUST below, for this layer instead of the
# runner's apk one: BuildKit keys this RUN on package*.json's content hash
# alone, so as long as that file doesn't change, GHA's layer cache
# (cache-from: type=gha,scope=scraper in .github/workflows/scraper.yml)
# keeps serving whatever this layer resolved on the LAST build that changed
# package*.json — even once a fresh `npm install` against today's registry
# would resolve a transitive dep differently. Bump whenever Trivy flags a
# "fixed" CVE in one of OUR dependencies that a plain re-run doesn't clear.
#
# NOTE: this does NOT cover node:20-alpine's own bundled npm CLI (its
# internal pacote/tar, etc.) — that lives under /usr/local/lib/node_modules
# in the base image itself, never touched by `npm install --omit=dev`, and
# this stage's node_modules is the only thing COPY'd into the runner stage
# below. See the runner stage's apk RUN block for that fix.
ARG NPM_CACHE_BUST=2026-09-29-deps-layer-cache-bust
RUN echo "cache-bust: ${NPM_CACHE_BUST}" && npm install --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# playwright-core needs a browser binary supplied separately — use system
# Chromium (same pattern as api/Dockerfile's Puppeteer setup) instead of
# letting Playwright download its own ~300MB bundled copy. Only used as a
# fallback when a custom career page needs JS rendering; most fetches
# never touch it.
ENV PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Cache-bust: BuildKit/GHA cache keys this RUN on its instruction text alone,
# not wall-clock time — a layer cached before an upstream CVE fix was
# published will keep being reused (and keep serving the vulnerable package)
# indefinitely otherwise. Bump ARG's value whenever Trivy's scan step flags a
# "fixed" OS-level CVE that a plain re-run doesn't clear.
ARG APK_CACHE_BUST=2026-09-29-util-linux-openssl-expat-CVEs
RUN echo "cache-bust: ${APK_CACHE_BUST}" && \
    apk upgrade --no-cache && \
    apk add --no-cache ca-certificates chromium nss freetype harfbuzz ttf-freefont && \
    # CMD is `node index.js` — this image never invokes npm/npx/corepack at
    # runtime, but node:20-alpine ships them anyway with their own bundled
    # deps (pacote, tar, ...) that go stale independently of anything in
    # our package.json. Confirmed 2026-09-29: Trivy flagged tar@6.2.1 and
    # pacote@18.0.6 (both HIGH, fixed upstream) at
    # usr/local/lib/node_modules/npm/node_modules/ — unrelated to our own
    # deps (the `deps` stage's node_modules is copied in separately below;
    # this is node:20-alpine's own global install). Removing the unused CLI
    # is simpler than chasing a compatible npm version pin every time its
    # own dependencies get a CVE — nothing here ever needs it again.
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs -h /home/scraper nodeapp && \
    chown -R nodeapp:nodejs /home/scraper

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY scripts ./scripts
COPY index.js ./
COPY package.json ./

USER nodeapp

CMD ["node", "index.js"]
