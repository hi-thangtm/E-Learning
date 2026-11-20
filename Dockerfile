# syntax=docker/dockerfile:1
# =============================================================================
# E-Learning — Dockerfile nhiều giai đoạn (multi-stage)
#   base    : Node 22 trên Debian 12 + openssl (Prisma cần)
#   deps    : cài node_modules
#   migrate : image dùng để chạy "prisma migrate deploy"
#   builder : build Next.js
#   runner  : image chạy thật, nhỏ gọn, chỉ chứa bản build "standalone"
# Yêu cầu: next.config có  output: "standalone"
# =============================================================================

FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps -------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Copy schema trước để "postinstall: prisma generate" (nếu có) chạy được
COPY prisma ./prisma
RUN npm ci

# ---- migrate ----------------------------------------------------------------
FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
