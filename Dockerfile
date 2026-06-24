# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Install backend deps (better-sqlite3 needs native compilation) ───
FROM node:22-alpine AS backend-builder
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

# ── Stage 3: Lean production image ────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Backend source + pre-built native modules
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/

# Frontend static files
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Persistent data dir — mount a volume here
RUN mkdir -p /app/data

# Bake the git commit hash at build time (falls back to 'unknown')
ARG COMMIT=unknown
ENV COMMIT=${COMMIT}
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "backend/server.js"]
