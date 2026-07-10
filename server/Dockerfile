# ─── WhatsApp Baileys Server — Dockerfile ─────────────────────────────────
# Deploy on Railway: https://railway.app
#
# After deploying:
#   1. Create a Volume in Railway Dashboard → mount at /app/baileys_auth
#   2. Set environment variables (see .env.example)
#   3. Set VITE_WHATSAPP_SERVER_URL in Netlify to your Railway URL

FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Install dependencies first (layer caching)
# Note: uses npm install (not ci) because the lockfile is managed by Bun locally.
COPY package.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Production Image ────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create auth directory (will be overridden by Railway Volume mount)
RUN mkdir -p /app/baileys_auth

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
