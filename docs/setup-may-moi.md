# Chạy E-Learning trên máy mới

## 1. Chuẩn bị

Cài Git, Node.js 22 và Docker Desktop. Mở Docker Desktop và chờ Docker Engine chạy. Các lệnh dưới đây dùng PowerShell. Trên macOS, dùng `cp` thay cho `Copy-Item`, `npm` thay cho `npm.cmd` và `npx` thay cho `npx.cmd`.

```powershell
git clone https://github.com/hi-thangtm/E-Learning.git
cd E-Learning
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Mở `.env` và điền các giá trị sau.

| Biến | Giá trị |
| --- | --- |
| `POSTGRES_PASSWORD` | Đặt mật khẩu mới. Có thể dùng chuỗi chữ và số để dễ đưa vào URL. |
| `DATABASE_URL` | Giữ cấu trúc trong file mẫu và thay mật khẩu cho khớp `POSTGRES_PASSWORD`. Nếu đổi cổng, sửa cả `POSTGRES_PORT` và URL. |
| `PGADMIN_PASSWORD` | Đặt mật khẩu đăng nhập pgAdmin. |
| `AUTH_SECRET` | Dán chuỗi ngẫu nhiên vừa tạo. |
| `SEED_ADMIN_PASSWORD` | Thêm dòng `SEED_ADMIN_PASSWORD=<mật khẩu mới>` nếu dùng dữ liệu mẫu. Mật khẩu có ít nhất 8 ký tự. |

```powershell
docker compose up -d --wait db pgadmin
npm.cmd ci
npx.cmd prisma generate
```

## 2. Chọn dữ liệu cho máy mới

### Tạo database mới với dữ liệu mẫu

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma db seed
```

Seed tạo tài khoản quản trị mặc định có mã nhân viên `ADMIN`, trừ khi bạn đặt `SEED_ADMIN_CODE`. Dùng `SEED_ADMIN_PASSWORD` để đăng nhập lần đầu và đổi mật khẩu theo yêu cầu trên giao diện.

### Mang nguyên dữ liệu từ máy cũ sang

Trên máy cũ, chạy trong thư mục dự án. Nếu có thể, tạm dừng thao tác ghi dữ liệu và tải tệp trong lúc sao lưu để hai bản sao khớp nhau.

```powershell
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/elearning.dump'
docker compose cp db:/tmp/elearning.dump ../elearning.dump
```

Chuyển riêng file `elearning.dump` và thư mục `uploads/` từ máy cũ sang máy mới qua kênh riêng. Nếu máy cũ đặt `UPLOAD_DIR` khác, sao chép nội dung từ thư mục đó. Với ứng dụng chạy bằng profile Docker `app`, tệp nằm trên volume Docker và có thể lấy bằng `docker compose cp app:/app/uploads ../elearning-uploads`.

Trên máy mới, đặt file dump cạnh thư mục repo và đưa các tệp tải lên vào `E-Learning/uploads/` hoặc đường dẫn `UPLOAD_DIR` đã cấu hình. Sau bước 1, nạp dump vào database mới còn trống. Bản dump chứa cả bảng và dữ liệu, nên chạy migration **sau khi** nạp dump và bỏ qua bước seed.

```powershell
docker compose cp ../elearning.dump db:/tmp/elearning.dump
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --single-transaction /tmp/elearning.dump'
npx.cmd prisma migrate deploy
```

Đăng nhập bằng tài khoản và mật khẩu hiện có trong database nguồn. Nếu các khóa học dùng Bunny Stream, điền các biến `BUNNY_STREAM_*` qua kênh riêng để ứng dụng tiếp tục dùng thư viện video đó. Giữ file dump, thư mục tải lên và `.env` ngoài các commit Git.

## 3. Chạy giao diện

```powershell
npm.cmd run dev
```

Mở [E-Learning](http://localhost:3000) và [pgAdmin](http://localhost:5050). Đăng nhập pgAdmin bằng `PGADMIN_EMAIL` và `PGADMIN_PASSWORD`. Khi kết nối đến server `E-Learning (Docker)`, nhập `POSTGRES_PASSWORD`. Nếu đổi cổng pgAdmin, dùng cổng đã đặt trong `PGADMIN_PORT`.

Những lần sau, mở Docker Desktop rồi chạy `docker compose up -d --wait db pgadmin` và `npm.cmd run dev`. Sau khi kéo phiên bản code mới, chạy lại `npm.cmd ci`, `npx.cmd prisma generate` và `npx.cmd prisma migrate deploy` trước khi khởi động ứng dụng.
