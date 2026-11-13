# syntax=docker/dockerfile:1.7
# =============================================================================
# Dockerfile cho phần mềm E-Learning (Next.js + Prisma + PostgreSQL)
#
# File này có nhiều "stage" (giai đoạn). Mỗi stage là một bước, dùng cho mục
# đích khác nhau:
#   - base     : nền chung (Node.js + openssl cho Prisma)
#   - dev      : môi trường lập trình trên máy Mac (hot reload)
#   - deps     : cài thư viện (node_modules) cho bản production
#   - builder  : build Next.js ra bản chạy thật
#   - migrator : chạy "prisma migrate deploy" để cập nhật cấu trúc database
#   - runner   : image cuối cùng, nhỏ gọn, chạy trên VPS
# =============================================================================

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# base: nền chung cho mọi stage
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
# Prisma cần openssl để kết nối database; tzdata để đặt múi giờ Việt Nam
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Ho_Chi_Minh \
    NEXT_TELEMETRY_DISABLED=1
# corepack giúp dùng được pnpm/yarn mà không phải cài thêm
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# dev: dùng khi lập trình (docker compose up). Code được "mount" từ máy Mac
# vào container, sửa code là trình duyệt tự cập nhật.
# ---------------------------------------------------------------------------
FROM base AS dev
COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh
EXPOSE 3000
CMD ["dev-entrypoint.sh"]

# ---------------------------------------------------------------------------
# deps: chỉ cài thư viện. Tách riêng để Docker cache lại — lần build sau nếu
# package.json không đổi thì bỏ qua bước này, build nhanh hơn nhiều.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --ignore-scripts; \
    elif [ -f package-lock.json ]; then npm ci --ignore-scripts; \
    else echo "LỖI: chưa có package-lock.json hoặc pnpm-lock.yaml" && exit 1; fi

# ---------------------------------------------------------------------------
# builder: build Next.js ở chế độ production
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Biến NEXT_PUBLIC_* được "đóng cứng" vào code lúc build nên phải truyền vào đây
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# Chạy lại các script cài đặt đã bỏ qua ở stage deps (Prisma engine, postinstall...)
RUN if [ -f pnpm-lock.yaml ]; then pnpm rebuild && pnpm run --if-present postinstall; \
    else npm rebuild && npm run postinstall --if-present; fi
RUN if [ -f prisma/schema.prisma ]; then npx --no-install prisma generate; fi
RUN if [ -f pnpm-lock.yaml ]; then pnpm run build; else npm run build; fi

# ---------------------------------------------------------------------------
# migrator: container chạy một lần để áp dụng migration lên database
# ---------------------------------------------------------------------------
FROM builder AS migrator
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runner: image chạy thật trên VPS — chỉ chứa phần cần thiết (output standalone)
# Yêu cầu: next.config.ts phải có  output: 'standalone'
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Không chạy bằng quyền root cho an toàn
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
