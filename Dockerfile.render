# =====================================================================
# OpenWA - Lightweight Dockerfile for Render Free Tier (512 MB RAM)
# =====================================================================
# Key optimizations for Render Free Plan:
# 1. Omits Chromium, Puppeteer browser download, X11, GTK, & ffmpeg
#    (Reduces image size from ~2.2 GB to ~180 MB, build time from ~15m to ~2m)
# 2. Defaults to ENGINE_TYPE=baileys (WebSockets, no browser)
#    (Consumes ~60-100 MB RAM instead of ~500+ MB with Chrome)
# 3. Sets NODE_OPTIONS="--max-old-space-size=384" to prevent V8 OOM crashes
# 4. Disables memory-heavy background queues, Redis, and search indexer
# =====================================================================

# ===== Stage 1: Builder =====
FROM docker.io/node:22-slim AS builder

WORKDIR /app

# Minimal build tools for native compilation if required (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY scripts/postinstall.js ./scripts/

# Skip browser binary download during build
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --include=dev

COPY . .

# Build NestJS backend and Dashboard SPA
RUN npm run build && npm run dashboard:ci -- --include=dev && npm run dashboard:build && rm -f dist/*.tsbuildinfo

# ===== Stage 2: Production Runtime =====
FROM docker.io/node:22-slim AS production

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    ENGINE_TYPE=baileys \
    OUTBOUND_ONLY=true \
    LITE_MODE=true \
    BAILEYS_SYNC_HISTORY=false \
    BAILEYS_SYNC_FULL_HISTORY=false \
    MEDIA_DOWNLOAD_ENABLED=false \
    BAILEYS_MARK_ONLINE_ON_CONNECT=false \
    BAILEYS_MESSAGE_STORE_LIMIT=50 \
    BAILEYS_SESSION_STORE_MAX_ENTRIES=100 \
    PORT=2785 \
    HOST=0.0.0.0 \
    DATABASE_TYPE=sqlite \
    DATABASE_NAME=./data/openwa.sqlite \
    SESSION_DATA_PATH=./data/sessions \
    QUEUE_ENABLED=false \
    REDIS_ENABLED=false \
    CACHE_ENABLED=false \
    SEARCH_ENABLED=false \
    MCP_ENABLED=false \
    SERVE_DASHBOARD=true \
    AUTO_START_SESSIONS=true \
    NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size"

WORKDIR /app

# Install dumb-init for clean process reaping and patch for Baileys fixes
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    patch \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r openwa && useradd -r -g openwa openwa

COPY package*.json ./
COPY scripts/ ./scripts/

# Install production dependencies only, apply Baileys patches, clean npm cache
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev --ignore-scripts \
    && node scripts/patch-baileys-appstate.js \
    && node scripts/patch-baileys-newsletter-create.js \
    && npm cache clean --force

# Copy compiled artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Set up data directories and permissions
RUN mkdir -p ./data/sessions ./data/media ./data/baileys \
    && chown -R openwa:openwa /app

USER openwa

EXPOSE 2785

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
