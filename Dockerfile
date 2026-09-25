# PolyVerses — AI Product Management Workbench
# Multi-Agent Orchestration Platform with 12-Agent Mesh (F00–F11)
# ──────────────────────────────────────────────────────────────────────────────
# Node.js v20.18.1 (current LTS at time of build)
# Stages:
#   1. Build frontend (Vite) + compile server (esbuild)
#   2. Production runtime (Express serving static + API)
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20.18.1-bookworm-slim AS base

# ─── Install build essentials ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Copy package files first for better layer caching ────────────────────────
COPY package.json ./

# ─── Install all dependencies (prod + dev, needed for build) ──────────────────
RUN npm ci --ignore-scripts 2>&1 || npm install --ignore-scripts

# ─── Copy source code ─────────────────────────────────────────────────────────
COPY . .

# ─── Build frontend (Vite) ────────────────────────────────────────────────────
RUN npm run build 2>&1 | tail -5

# ─── Build server bundle (esbuild → dist/server.cjs) ─────────────────────────
RUN npm run build:server 2>&1 | tail -3 || echo "No separate server build step"

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20.18.1-bookworm-slim AS production

WORKDIR /app

# ─── Install only runtime dependencies ────────────────────────────────────────
COPY package.json ./
RUN npm ci --only=production --ignore-scripts 2>&1 || npm install --only=production --ignore-scripts

# ─── Copy built artifacts from builder stage ───────────────────────────────────
COPY --from=base /app/dist ./dist
COPY --from=base /app/server.ts ./
COPY --from=base /app/src/firebase.ts ./src/firebase.ts
COPY --from=base /app/src/agents ./src/agents
COPY --from=base /app/src/components ./src/components
COPY --from=base /app/src/types.ts ./src/types.ts
COPY --from=base /app/src/context-cache.ts ./src/context-cache.ts
COPY --from=base /app/src/execution-store.ts ./src/execution-store.ts
COPY --from=base /app/src/knowledge-types.ts ./src/knowledge-types.ts
COPY --from=base /app/src/ExerciseLibrary.ts ./src/ExerciseLibrary.ts
COPY --from=base /app/src/AthenaCodeStore.ts ./src/AthenaCodeStore.ts
COPY --from=base /app/fitness.json ./fitness.json

# ─── Environment ───────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Gemini API key — set at runtime via docker run -e or docker-compose environment
# ENV GEMINI_API_KEY=your-key-here

# Firebase config (optional, set via environment or mount config file)
# ENV FIREBASE_APP_ID=your-app-id
# ENV FIREBASE_API_KEY=your-api-key

# ─── Healthcheck ───────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# ─── Expose port ───────────────────────────────────────────────────────────────
EXPOSE 3000

# ─── Start server ──────────────────────────────────────────────────────────────
CMD ["node", "server.ts"]
