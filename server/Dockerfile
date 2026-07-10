# ─── WhatsApp Baileys Server — Dockerfile ─────────────────────────────────
# Deploy on Railway: https://railway.app
#
# After deploying:
#   1. Create a Volume in Railway Dashboard → mount at /app/baileys_auth
#   2. Set environment variables (see .env.example)
#   3. Set VITE_WHATSAPP_SERVER_URL in Netlify to your Railway URL

FROM node:22-alpine AS builder

WORKDIR /app

# Install git — @whiskeysockets/baileys depends on libsignal via git+https://
# Bun's native git handler sometimes falls back to system git, so ensure it's present.
RUN apk add --no-cache git openssh-client

# Install Bun (handles git dependencies natively)
RUN npm install -g bun@1.3.14

# Install dependencies (locked via bun.lock for deterministic builds)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run build

# ─── Production Image ────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install git for libsignal dep
RUN apk add --no-cache git openssh-client

# Install Bun
RUN npm install -g bun@1.3.14

# Install only production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Remove git to keep image small
RUN apk del git openssh-client

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create auth directory (will be overridden by Railway Volume mount)
RUN mkdir -p /app/baileys_auth

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
