#!/bin/sh
# =============================================================================
# Script khởi động container "app" khi lập trình.
#   1. Nếu chưa có code Next.js (chưa có package.json) -> chờ, không báo lỗi
#   2. Cài thư viện nếu package.json / lockfile thay đổi
#   3. Tạo Prisma Client nếu đã có prisma/schema.prisma
#   4. Chạy "next dev"
# =============================================================================
set -e
cd /app

if [ ! -f package.json ]; then
  echo "--------------------------------------------------------------"
  echo " Chưa có package.json — chưa có code Next.js."
  echo " Tạo project bằng lệnh (chạy trên máy Mac, trong thư mục E-Learning):"
  echo "   docker compose exec app sh docker/init-next-app.sh"
  echo " Sau đó: docker compose restart app"
  echo "--------------------------------------------------------------"
  exec tail -f /dev/null
fi

# Chọn trình quản lý gói theo lockfile đang có
if [ -f pnpm-lock.yaml ]; then PM=pnpm; LOCK=pnpm-lock.yaml
else PM=npm; LOCK=package-lock.json; fi

# Chỉ cài lại thư viện khi package.json hoặc lockfile thay đổi (tiết kiệm thời gian)
HASH=$(cat package.json "$LOCK" 2>/dev/null | md5sum | cut -d' ' -f1)
if [ ! -f node_modules/.deps-hash ] || [ "$(cat node_modules/.deps-hash)" != "$HASH" ]; then
  echo ">> Cài thư viện bằng $PM ..."
  if [ "$PM" = pnpm ]; then pnpm install; else npm install; fi
  echo "$HASH" > node_modules/.deps-hash
fi

# Chỉ chạy khi Prisma đã được cài trong dự án (tránh npx tự tải bản Prisma khác)
if [ -f prisma/schema.prisma ] && [ -x node_modules/.bin/prisma ]; then
  echo ">> prisma generate"
  npx --no-install prisma generate
fi

echo ">> Chạy Next.js dev tại http://localhost:3000"
if [ "$PM" = pnpm ]; then exec pnpm dev --hostname 0.0.0.0
else exec npm run dev -- --hostname 0.0.0.0; fi
