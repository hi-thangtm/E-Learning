# Chạy E-Learning trên máy mới

Có 2 cách chạy, cả 2 đều dùng `docker-compose.yml` có sẵn:

| Cách | Docker chạy | Next.js chạy | Dùng khi |
| --- | --- | --- | --- |
| **A — Phát triển** (khuyên dùng) | PostgreSQL + pgAdmin | `npm run dev` trên máy (sửa code là trang tự cập nhật) | Code hằng ngày |
| **B — Toàn bộ bằng Docker** | PostgreSQL + pgAdmin + migrate + app (build image từ `Dockerfile`) | Trong container `elearning-app` (bản production) | Chạy thử giống VPS |

Các lệnh bên dưới viết cho macOS / Linux. Trên Windows (PowerShell): dùng `Copy-Item` thay cho `cp`, `npm.cmd` thay cho `npm`, `npx.cmd` thay cho `npx`.

## 1. Chuẩn bị (bắt buộc cho cả 2 cách)

Cài Git, Node.js 22 và Docker Desktop. Mở Docker Desktop và chờ Docker Engine chạy.

```bash
git clone https://github.com/hi-thangtm/E-Learning.git
cd E-Learning
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Mở `.env` và điền các giá trị sau.

| Biến | Giá trị |
| --- | --- |
| `POSTGRES_PASSWORD` | Đặt mật khẩu mới. Chỉ dùng chữ và số để không làm hỏng `DATABASE_URL`. |
| `DATABASE_URL` | Giữ cấu trúc trong file mẫu và thay mật khẩu cho khớp `POSTGRES_PASSWORD`. Nếu đổi cổng, sửa cả `POSTGRES_PORT` và URL. |
| `PGADMIN_PASSWORD` | Đặt mật khẩu đăng nhập pgAdmin. |
| `AUTH_SECRET` | Dán chuỗi ngẫu nhiên vừa tạo khi cài mới. Khi chuyển dữ liệu từ máy cũ, dùng lại giá trị cũ để đọc các bí mật tích hợp (Bunny, Lark) đã mã hóa trong database. Nếu dùng khóa mới, nhập lại các bí mật đó trên giao diện. |
| `SEED_ADMIN_PASSWORD` | Thêm dòng `SEED_ADMIN_PASSWORD=<mật khẩu mới>` nếu tạo database mới bằng seed. Mật khẩu có ít nhất 8 ký tự. |

Nếu máy đã có chương trình khác chiếm cổng 5432, 5050 hoặc 3000 (lỗi `port is already allocated`), xem bằng `docker ps` rồi dừng nó, hoặc đổi `POSTGRES_PORT` / `PGADMIN_PORT` / `APP_PORT` trong `.env`.

## 2. Cách A — Chạy để phát triển

```bash
docker compose up -d --wait db pgadmin   # tải image, tạo container db + pgAdmin, chờ db sẵn sàng
npm ci                                   # cài thư viện
npx prisma generate                      # tạo Prisma Client
```

Tiếp theo chọn dữ liệu (mục 4), rồi chạy giao diện:

```bash
npm run dev
```

Mở [E-Learning](http://localhost:3000).

Những lần sau: mở Docker Desktop rồi chạy `docker compose up -d --wait db pgadmin` và `npm run dev`. Sau khi kéo phiên bản code mới, chạy lại `npm ci`, `npx prisma generate` và `npx prisma migrate deploy` trước khi khởi động ứng dụng.

## 3. Cách B — Chạy toàn bộ bằng Docker

Lệnh sau build 2 image từ `Dockerfile` (`migrate` và `app`) rồi chạy theo thứ tự: `db` sẵn sàng → `migrate` chạy `prisma migrate deploy` xong thì tự thoát → `app` khởi động. Migration lỗi thì app không chạy.

```bash
docker compose --profile app up -d --build
docker compose ps                         # elearning-db: healthy · elearning-migrate: Exited (0) · elearning-app: Up
docker compose logs -f app                # xem log app (Ctrl+C để thôi xem)
```

Container app không chứa công cụ tạo dữ liệu mẫu, nên bước seed chạy từ máy vào database trong Docker (cổng `POSTGRES_PORT` đã mở cho chính máy này):

```bash
npm ci
npx prisma generate
npx prisma db seed                        # hoặc: npm run demo:seed -- --yes (xem mục 4)
```

Mở [E-Learning](http://localhost:3000). Tệp tải lên nằm trong volume Docker `uploads`, không mất khi build lại image.

Khi kéo code mới về:

```bash
git pull
docker compose --profile app up -d --build   # build lại image; migrate tự chạy migration mới
```

Dừng các container (dữ liệu vẫn giữ trong volume): `docker compose --profile app down`. **Không** dùng `docker compose down -v`: cờ `-v` xoá luôn volume chứa database và tệp tải lên.

## 4. Chọn dữ liệu cho máy mới

### Tạo database mới với dữ liệu mẫu

Cách A cần chạy migration trước; với cách B, container `migrate` đã làm việc này nên bỏ qua dòng đầu.

```bash
npx prisma migrate deploy
npx prisma db seed
```

Seed tạo công ty `TONG` và tài khoản quản trị mặc định có mã nhân viên `ADMIN`, trừ khi bạn đặt `SEED_ADMIN_CODE`. Dùng `SEED_ADMIN_PASSWORD` để đăng nhập lần đầu và đổi mật khẩu theo yêu cầu trên giao diện. Lệnh này không xoá dữ liệu đang có.

### Dữ liệu demo đầy đủ

```bash
npm run demo:seed -- --yes
```

**Lệnh này XOÁ SẠCH database trong `DATABASE_URL` rồi nạp dữ liệu demo.** Mật khẩu mọi tài khoản demo là `123456789`; danh sách tài khoản ở [dữ liệu demo](demo-data.md).

### Mang nguyên dữ liệu từ máy cũ sang

Trên máy cũ, chạy trong thư mục dự án. Nếu có thể, tạm dừng thao tác ghi dữ liệu và tải tệp trong lúc sao lưu để hai bản sao khớp nhau.

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/elearning.dump'
docker compose cp db:/tmp/elearning.dump ../elearning.dump
```

Chuyển riêng file `elearning.dump` và thư mục `uploads/` từ máy cũ sang máy mới qua kênh riêng. Nếu máy cũ đặt `UPLOAD_DIR` khác, sao chép nội dung từ thư mục đó. Với ứng dụng chạy bằng cách B, tệp nằm trên volume Docker và có thể lấy bằng `docker compose cp app:/app/uploads ../elearning-uploads`.

Trên máy mới, đặt file dump cạnh thư mục repo và đưa các tệp tải lên vào `E-Learning/uploads/` hoặc đường dẫn `UPLOAD_DIR` đã cấu hình (cách B: `docker compose cp ../elearning-uploads/. app:/app/uploads`). Sau bước 1, nạp dump vào database mới còn trống. Bản dump chứa cả bảng và dữ liệu, nên chạy migration **sau khi** nạp dump và bỏ qua bước seed.

```bash
docker compose up -d --wait db
docker compose cp ../elearning.dump db:/tmp/elearning.dump
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --single-transaction /tmp/elearning.dump'
npx prisma migrate deploy
```

Với cách B, nạp dump trước rồi mới chạy `docker compose --profile app up -d --build`.

Đăng nhập bằng tài khoản và mật khẩu hiện có trong database nguồn. Nếu các khóa học dùng Bunny Stream, điền các biến `BUNNY_STREAM_*` qua kênh riêng để ứng dụng tiếp tục dùng thư viện video đó. Giữ file dump, thư mục tải lên và `.env` ngoài các commit Git.

## 5. pgAdmin

Mở [pgAdmin](http://localhost:5050) và đăng nhập bằng `PGADMIN_EMAIL` và `PGADMIN_PASSWORD`. Khi kết nối đến server `E-Learning (Docker)` (đã khai báo sẵn), nhập `POSTGRES_PASSWORD`. Nếu đổi cổng pgAdmin, dùng cổng đã đặt trong `PGADMIN_PORT`.

## 6. Đồng bộ danh bạ Lark

1. Đăng nhập bằng tài khoản Admin tập đoàn và mở **Hệ thống › Kết nối Lark**.
2. Lưu cấu hình ứng dụng Lark, kiểm tra kết nối và ghép từng công ty với phòng ban gốc tương ứng.
3. Chạy thử, kiểm tra danh sách tài khoản thay đổi, rồi áp dụng. Với tài khoản mới tạo từ Lark, dùng **Đặt lại mật khẩu** trong trang chi tiết nhân viên để cấp mật khẩu tạm.

Nếu máy cũ đọc cấu hình Lark từ `.env`, chuyển riêng các biến `LARK_APP_ID`, `LARK_APP_SECRET` và `LARK_DOMAIN`. Nếu cấu hình được lưu trên giao diện, kiểm tra lại kết nối sau khi khôi phục database. Xem danh sách quyền và quy trình vận hành trong [hướng dẫn cấu hình Lark](lark-setup.md).
