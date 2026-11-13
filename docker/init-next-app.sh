#!/bin/sh
# =============================================================================
# Tạo khung dự án Next.js NGAY TRONG thư mục gốc E-Learning.
#
# Vì sao không chạy thẳng "create-next-app ." ?
#   create-next-app từ chối chạy trong thư mục đã có file (Dockerfile,
#   docker-compose.yml, typescript-version/...). Nên script này:
#     1. Tạo dự án Next.js ở thư mục tạm /tmp/next-app (bên trong container)
#     2. Chép sang /app (= thư mục E-Learning trên máy Mac), KHÔNG ghi đè
#        file nào đang có
#     3. Chỉnh tsconfig / eslint để bỏ qua thư mục mẫu typescript-version
#     4. Bật output: 'standalone' trong next.config.ts (cần cho bản chạy VPS)
#
# Cách chạy (trên máy Mac):
#   docker compose exec app sh docker/init-next-app.sh
# =============================================================================
set -e
cd /app

if [ -f package.json ]; then
  echo "Đã có package.json — dự án Next.js đã được tạo rồi, dừng lại."
  exit 1
fi

TMP=/tmp/next-app
rm -rf "$TMP"

echo ">> [1/4] Tạo khung Next.js 16 (TypeScript, App Router, Tailwind, ESLint, thư mục src/)"
npx --yes create-next-app@16 "$TMP" \
  --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --turbopack \
  --skip-install --disable-git --yes

echo ">> [2/4] Chép code vào thư mục E-Learning (không ghi đè file đang có)"
cp -an "$TMP"/. /app/
rm -rf "$TMP"

echo ">> [3/4] Cho TypeScript và ESLint bỏ qua thư mục mẫu typescript-version"
node -e "
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
t.exclude = [...new Set([...(t.exclude || []), 'node_modules', 'typescript-version'])];
fs.writeFileSync('tsconfig.json', JSON.stringify(t, null, 2) + '\n');
"
if [ -f eslint.config.mjs ] && grep -q '".next/\*\*",' eslint.config.mjs; then
  sed -i 's#".next/\*\*",#".next/**",\n    "typescript-version/**",#' eslint.config.mjs
else
  echo "   (!) Không tự sửa được eslint.config.mjs — hãy thêm \"typescript-version/**\" vào phần ignores"
fi

echo ">> [4/4] Bật output: 'standalone' trong next.config.ts"
if grep -q '/\* config options here \*/' next.config.ts; then
  sed -i 's#/\* config options here \*/#output: "standalone",#' next.config.ts
else
  echo "   (!) Không tự sửa được next.config.ts — hãy thêm  output: \"standalone\",  vào nextConfig"
fi

echo ""
echo "XONG. Chạy tiếp lệnh sau để cài thư viện và bật Next.js:"
echo "   docker compose restart app"
