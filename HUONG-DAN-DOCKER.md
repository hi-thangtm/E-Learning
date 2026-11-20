# Hướng dẫn chạy dự án E-Learning bằng Docker

## 1. Kiến trúc và lý do chọn

| Container | Vai trò | Cổng trên máy |
|---|---|---|
| `elearning-db` | PostgreSQL 17, lưu toàn bộ dữ liệu | `localhost:5432` |
| `elearning-pgadmin` | Giao diện web để xem/sửa database | `http://localhost:5050` |
| `elearning-migrate` | Chạy migration Prisma 1 lần rồi tự tắt | — |
| `elearning-app` | Next.js bản production | `http://localhost:3000` |

**Quyết định kỹ thuật:**

- **Khi code hằng ngày:** chỉ chạy `db` + `pgadmin` trong Docker. Next.js chạy thẳng trên Mac bằng `npm run dev`. Trên macOS, Docker đọc file trong thư mục code chậm, nên chạy Next.js trong Docker sẽ làm hot reload (lưu file là trình duyệt tự cập nhật) bị chậm hẳn.
- **Khi muốn kiểm tra trước khi đưa lên VPS:** bật thêm `migrate` + `app` bằng `--profile app`. Lúc này app chạy y hệt như trên server.
- Mọi cổng chỉ mở ở `127.0.0.1`, tức là chỉ chính máy đó truy cập được. Trên VPS sau này Caddy sẽ đứng trước app để có HTTPS, còn database không bao giờ mở ra Internet.
- Dữ liệu nằm trong **volume** `pgdata`. Xoá hay tạo lại container không làm mất dữ liệu.

## 2. Đặt file vào dự án

Copy các file vào **thư mục gốc** của dự án (thư mục `E-Learning`, cùng cấp với `package.json`):

```
E-Learning/
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── .env.example
├── docker/
│   └── pgadmin/
│       └── servers.json
├── prisma/
│   └── schema.prisma
├── package.json
└── next.config.ts
```

Trong `.dockerignore` có một dòng `# vuexy-template/`. Hãy bỏ dấu `#` và sửa thành đúng tên thư mục template Vuexy để không bị copy vào image.

### Sửa `next.config.ts` (bắt buộc cho bản production)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

`output: "standalone"` bảo Next.js khi build thì gom riêng những file thật sự cần để chạy vào `.next/standalone`. Nhờ vậy image cuối nhẹ hơn nhiều (khoảng 200MB thay vì hơn 1GB), rất quan trọng với VPS chỉ có 30GB ổ cứng.

### Kiểm tra `.gitignore`

Phải có dòng này, vì repo đang để public:

```
.env
```

## 3. Lần đầu chạy (trên Mac)

### Bước 1 — Tạo file `.env`

```bash
cp .env.example .env
```
- `cp` = copy. Lệnh này tạo `.env` từ file mẫu `.env.example`.
- `.env` chứa mật khẩu thật nên không commit. `.env.example` chỉ có giá trị mẫu nên được commit để người khác biết cần điền những biến nào.

Sau đó mở `.env` và đổi `POSTGRES_PASSWORD` và `PGADMIN_PASSWORD`. Nhớ đổi luôn mật khẩu nằm trong dòng `DATABASE_URL` cho khớp. Chỉ dùng chữ và số trong mật khẩu.

```bash
openssl rand -base64 32
```
- Lệnh này sinh 32 byte ngẫu nhiên rồi mã hoá thành chuỗi ký tự.
- Dán kết quả vào `AUTH_SECRET=`. Auth.js dùng khoá này để ký phiên đăng nhập. Ai có khoá này là giả mạo được phiên đăng nhập, nên phải giữ bí mật.

> Nếu bạn đổi `POSTGRES_USER` khác `elearning_admin`, sửa luôn `"Username"` trong `docker/pgadmin/servers.json`.

### Bước 2 — Tắt Postgres cũ nếu có

Nếu trước đây bạn đã chạy một container Postgres khác ở cổng 5432, phải dừng nó trước, nếu không sẽ báo lỗi `port is already allocated`:

```bash
docker ps
```
- Liệt kê các container **đang chạy**. Xem cột `PORTS` có container nào đang dùng `5432` hoặc `5050` không.

```bash
docker stop <tên-container-cũ>
```
- Dừng container đó. Dữ liệu của nó vẫn còn, chỉ là tạm tắt.

### Bước 3 — Bật database + pgAdmin

```bash
docker compose up -d
```
- `docker compose` đọc file `docker-compose.yml` trong thư mục hiện tại.
- `up` tạo và khởi động các container. Những service có `profiles: ["app"]` sẽ bị **bỏ qua**, nên lệnh này chỉ chạy `db` + `pgadmin`.
- `-d` (detached) cho container chạy nền và trả lại terminal cho bạn. Lần đầu sẽ mất 1–2 phút để tải image.

```bash
docker compose ps
```
- Xem trạng thái các container của dự án. Cột `STATUS` của `elearning-db` cần hiện `healthy`. Đó là kết quả của `healthcheck`: Docker chạy `pg_isready` mỗi 5 giây để kiểm tra Postgres đã sẵn sàng nhận kết nối chưa.

### Bước 4 — Tạo bảng bằng Prisma

```bash
npm install
```
- Cài toàn bộ thư viện ghi trong `package.json` vào thư mục `node_modules`.

```bash
npx prisma migrate dev --name init
```
- `npx` chạy công cụ `prisma` có sẵn trong `node_modules`.
- `migrate dev` so sánh `schema.prisma` với database. Nó sinh ra file SQL trong `prisma/migrations/` rồi chạy file đó để tạo 20 bảng.
- `--name init` là tên của lần migration này, giúp đọc lịch sử dễ hơn.
- Lệnh này dùng `DATABASE_URL` trong `.env` (host là `localhost`), vì bạn đang chạy từ Mac.
- Thư mục `prisma/migrations/` **phải được commit**. Server sẽ dùng chính các file này để tạo bảng.

### Bước 5 — Chạy app để code

```bash
npm run dev
```
- Khởi động Next.js ở chế độ phát triển tại `http://localhost:3000`. Sửa code là trang tự cập nhật. Bấm `Ctrl + C` để dừng.

### Bước 6 — Mở pgAdmin

1. Vào `http://localhost:5050` và đăng nhập bằng `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` trong `.env`.
2. Bên trái đã có sẵn **Servers › E-Learning (Docker)**, nhờ file `servers.json`.
3. Bấm vào, nhập `POSTGRES_PASSWORD`, rồi tích *Save password*.
4. Mở **Databases › elearning › Schemas › public › Tables** để xem các bảng.

> Trong pgAdmin, host là `db` chứ không phải `localhost`. Lý do: pgAdmin chạy **bên trong** Docker. Trong mạng nội bộ của Docker, các container gọi nhau bằng tên service. `localhost` ở bên trong container pgAdmin là chính container đó, không phải máy Mac.

## 4. Chạy thử bản production (giống VPS)

```bash
docker compose --profile app up -d --build
```
- `--profile app` bật thêm các service có gắn profile `app`, tức là `migrate` và `app`.
- `--build` build lại image từ `Dockerfile` trước khi chạy. Cần thêm cờ này mỗi lần code thay đổi.
- Thứ tự Docker tự xử lý: `db` healthy → `migrate` chạy `prisma migrate deploy` xong và thoát thành công → `app` mới khởi động. Nếu migration lỗi, app sẽ không chạy, nhờ vậy tránh được tình trạng app chạy với database sai cấu trúc.

Mở `http://localhost:3000` để kiểm tra.

> Trước khi chạy lệnh này, tắt `npm run dev` đi, vì cả hai cùng dùng cổng 3000.

**`migrate dev` khác `migrate deploy` thế nào?**
- `migrate dev` dùng khi code. Nó **tạo** migration mới từ thay đổi trong schema và có thể đề nghị xoá dữ liệu để làm lại.
- `migrate deploy` dùng trên server. Nó **chỉ chạy** những migration đã có sẵn mà chưa chạy, không bao giờ tạo mới hay xoá dữ liệu.

### Dockerfile làm gì (5 giai đoạn)

1. **base**: Node 22 trên Debian 12, cài thêm `openssl` vì Prisma cần thư viện này để kết nối Postgres. Schema đã khai báo `binaryTargets = ["native", "debian-openssl-3.0.x"]` để khớp với môi trường này.
2. **deps**: chạy `npm ci` để cài thư viện **đúng y** phiên bản trong `package-lock.json`. Vì vậy bản build lần nào cũng giống nhau.
3. **migrate**: tái dùng `node_modules` vừa cài để chạy `prisma migrate deploy`.
4. **builder**: chạy `prisma generate` (sinh code truy vấn DB) rồi `npm run build`.
5. **runner**: image cuối, chỉ copy bản build standalone sang. Chạy bằng user `nextjs` thay vì `root`, để nếu app bị tấn công thì kẻ xấu cũng không có toàn quyền trong container.

Nhờ chia giai đoạn, image cuối không chứa mã nguồn, công cụ build hay devDependencies, nên vừa nhẹ vừa an toàn hơn.

## 5. Lệnh dùng hằng ngày

| Lệnh | Ý nghĩa |
|---|---|
| `docker compose up -d` | Bật DB + pgAdmin |
| `docker compose stop` | Tạm dừng container, giữ nguyên container và dữ liệu |
| `docker compose down` | Xoá container + mạng. **Dữ liệu vẫn còn** vì nằm trong volume |
| `docker compose --profile app down` | Như trên, nhưng tính cả `migrate` + `app` |
| `docker compose logs -f db` | Xem log của Postgres theo thời gian thực (`-f` = follow), `Ctrl + C` để thoát |
| `docker compose logs -f app` | Xem log của Next.js bản production |
| `docker compose exec db psql -U elearning_admin -d elearning` | Mở dòng lệnh SQL ngay trong container DB. Gõ `\dt` để liệt kê bảng, `\q` để thoát |
| `npx prisma studio` | Giao diện xem dữ liệu của Prisma (nhẹ hơn pgAdmin), mở tại `localhost:5555` |

### Sao lưu và khôi phục database

```bash
docker compose exec -T db pg_dump -U elearning_admin -d elearning > backup_$(date +%Y%m%d).sql
```
- `exec -T` chạy lệnh bên trong container `db`. Cờ `-T` tắt chế độ terminal tương tác để đầu ra ghi được ra file.
- `pg_dump` xuất toàn bộ database thành các câu lệnh SQL.
- `> backup_$(date +%Y%m%d).sql` ghi kết quả ra file trên máy, tên file có kèm ngày, ví dụ `backup_20261120.sql`.

```bash
docker compose exec -T db psql -U elearning_admin -d elearning < backup_20261120.sql
```
- Ngược lại: đẩy nội dung file SQL vào `psql` để khôi phục.

### ⚠️ Lệnh xoá sạch dữ liệu

```bash
docker compose down -v
```
- `-v` xoá luôn các volume, tức là **mất toàn bộ dữ liệu database và cấu hình pgAdmin**. Chỉ dùng khi thật sự muốn làm lại từ đầu.

## 6. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `port is already allocated` | Có chương trình khác đang dùng cổng 5432/5050/3000 | Tắt chương trình đó, hoặc đổi `POSTGRES_PORT`/`PGADMIN_PORT`/`APP_PORT` trong `.env` |
| `P1000: Authentication failed` | Mật khẩu trong `DATABASE_URL` không khớp `POSTGRES_PASSWORD` | Sửa cho khớp. Nếu bạn đổi mật khẩu **sau khi** đã chạy lần đầu, Postgres vẫn giữ mật khẩu cũ (chỉ đọc biến lúc khởi tạo volume). Khi đó đổi lại mật khẩu cũ, hoặc `down -v` để làm lại nếu chưa có dữ liệu quan trọng |
| `P1001: Can't reach database` | Container DB chưa chạy | `docker compose ps`, rồi `docker compose up -d` |
| Build báo không tìm thấy `.next/standalone` | Chưa thêm `output: "standalone"` | Sửa `next.config.ts` như mục 2 |
| Build báo không tìm thấy `public` | Dự án chưa có thư mục `public` | Tạo thư mục `public` trống (thêm file `.gitkeep` vào bên trong) |
| Build lỗi kết nối DB lúc `npm run build` | Có trang truy vấn DB lúc build (trang tĩnh) | Thêm `export const dynamic = "force-dynamic"` cho trang đó |
| pgAdmin báo email không hợp lệ | pgAdmin không chấp nhận đuôi như `.local` | Dùng email dạng `ten@congty.com` hoặc `admin@example.com` |

## 7. Ghi chú cho lúc lên VPS (bước sau)

- VPS chỉ có 2GB RAM, mà `npm run build` của Next.js có thể ngốn hơn 1.5GB. Trước khi build trên VPS, cần bật **swap 2GB**. Cách khác tốt hơn là build image ở Mac hoặc GitHub Actions rồi đẩy lên registry, VPS chỉ việc tải về chạy.
- Sẽ thêm `docker-compose.prod.yml` có **Caddy** (tự cấp HTTPS) đứng trước `app`. pgAdmin trên VPS **không mở ra Internet**, chỉ truy cập qua SSH tunnel.
