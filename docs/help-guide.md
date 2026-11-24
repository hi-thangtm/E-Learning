# Trang Hướng dẫn sử dụng (/help) — bảo trì

Trang trong phần mềm, mở từ **ảnh đại diện › Hướng dẫn sử dụng**. Mọi vai trò vào được; mỗi người chỉ thấy chương / mục đúng vai trò.

## Sửa nội dung

| Việc | File |
|---|---|
| Nội dung 7 chương (chữ, bước, bảng, ảnh) | `src/lib/help/content/*.ts` (thứ tự chương: `content/index.ts`) |
| Kiểu khối nội dung, lọc theo vai trò, chỉ mục tìm kiếm | `src/lib/help/types.ts`, `src/lib/help/index.ts` |
| Giao diện trang | `src/app/(app)/help/*` |

- Mỗi chương có `roles`; mục (`section.roles`) và ảnh (`shot.roles`) có thể giới hạn thêm. Nhóm vai trò: `content/roles.ts`.
- Chữ chỉ hỗ trợ `**nhãn**` → in đậm (dùng cho tên nút / tab / ô nhập, chép ĐÚNG chữ trên giao diện). Không viết HTML.
- `id` của mục là anchor (`/help?c=<chương>#<mục>`) — duy nhất trong cả trang, đừng đổi id đã chia sẻ cho người dùng.
- Đổi chức năng / nhãn nút → nhớ sửa chương tương ứng ở đây.

## Ảnh minh hoạ

Ảnh ở `public/images/help/<tên>.jpg`, kích thước ở `src/lib/help/shots-manifest.json` — cả hai do script sinh ra.
Nội dung tham chiếu ảnh theo tên (`{ type: "shot", name: "hv-video" }`): tên không có trong manifest là **lỗi tsc**.

Chụp lại (khi giao diện đổi):

```bash
npm run demo:seed -- --yes        # (nếu DB dev chưa có dữ liệu demo — XOÁ SẠCH DB dev)
npm run build && npx next start -p 3000
npm run help:shots                # chụp tất cả (~60 ảnh, vài phút)
npm run help:shots -- --only hv-video,qt-users   # chụp lại vài ảnh
```

- Danh sách ảnh + thao tác trước khi chụp: `scripts/help/shots.ts` (tài khoản demo, mật khẩu `123456789`). Thêm ảnh mới = thêm 1 dòng
  ở đây, chạy `--only <tên>`, rồi dùng tên đó trong nội dung.
- Quy tắc: script chỉ XEM — không bấm lưu / gửi / nộp. Bài kiểm tra dùng “Làm thử” ở tab Xem trước (không ghi dữ liệu).
- Chạy bằng `next start` (không dùng `next dev`). Máy tính 1440×900, điện thoại 390×844 (ảnh tên `…-m`).

## Kiểm thử

`e2e/14-huong-dan.spec.ts` (chương theo vai trò, tìm kiếm không dấu, mọi ảnh trong manifest tải được, phóng to ảnh);
`e2e/11-dien-thoai.spec.ts` kiểm tra `/help` không cuộn ngang ở 375px.
