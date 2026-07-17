# ── Stage 1: install deps ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

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
ARG APK_CACHE_BUST=2026-07-17-libjxl-CVE-2026-1837
RUN echo "cache-bust: ${APK_CACHE_BUST}" && \
    apk upgrade --no-cache && \
    apk add --no-cache ca-certificates chromium nss freetype harfbuzz ttf-freefont

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
