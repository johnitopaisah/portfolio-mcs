# ── Stage 1: install deps ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates

RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs -h /home/scraper nodeapp && \
    chown -R nodeapp:nodejs /home/scraper

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY index.js ./
COPY package.json ./

USER nodeapp

CMD ["node", "index.js"]
