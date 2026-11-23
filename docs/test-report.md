# Báo cáo kiểm thử toàn luồng (Việc 31)

Ngày chạy: 23/11/2026 · Công cụ: Playwright 1.65 (Chromium) · Bản production (`next build` + `next start -p 3200`) · Database `elearning_test`.
Kịch bản chi tiết + cách chạy: `docs/test-scenarios.md`.

## Kết quả

| Hạng mục | Kết quả |
|---|---|
| Số test | **41** (1 đăng nhập chung + 37 kịch bản + 3 chạy cuối) trong 11 file |
| Kết quả | **41 / 41 đạt** — 2 lượt liên tiếp (lượt 2 không seed lại → chạy lặp được) |
| Thời gian `npm run test:e2e` | ≈ **71 giây** (seed ~2 giây, build ~10 giây khi có cache, chạy test ~60 giây với 3 luồng); build mới hoàn toàn thêm khoảng 1–2 phút — vẫn < 10 phút |
| Video YouTube | Thời lượng đo được bằng trình phát thật (cần mạng). Không có mạng → test tự điền thời lượng qua DB và ghi chú trong báo cáo HTML |
| Kiểm tra khác | `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:auth`: sạch |

| File | Số test | Kết quả |
|---|---|---|
| global.setup.ts | 1 | Đạt |
| 01-to-chuc | 4 | Đạt |
| 02-soan-khoa | 1 | Đạt |
| 03-giao-khoa | 4 | Đạt |
| 04-hoc-vien | 5 | Đạt |
| 05-phien-ban | 2 | Đạt |
| 06-thu-vien-lo-trinh | 2 | Đạt |
| 07-quan-ly | 5 | Đạt |
| 08-tac-vu | 1 | Đạt |
| 09-phan-quyen | 10 | Đạt |
| 10-nhat-ky | 3 | Đạt |
| 99-gioi-han-dang-nhap (chạy cuối) | 3 | Đạt |

## Lỗi phát hiện

Mức: **Cao** = sai dữ liệu / lộ quyền · **Trung bình** = sai chức năng có cách tránh · **Thấp** = hiển thị.

| # | Mức | Mô tả | Cách tái hiện | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | Thấp | Cột “Ngày HT TB” (Báo cáo → Theo khoá học) hiện **“-0”** khi trung bình số ngày hoàn thành là số âm rất nhỏ (lượt học có `completedAt` sớm hơn `createdAt` vài giây — dữ liệu nhập tay / đồng hồ lệch). `Math.round` của số âm nhỏ ra `-0`, `toLocaleString` in “-0”. | Tạo lượt học COMPLETED có `completedAt = createdAt − 5 giây` → mở `/reports?tab=courses` | `src/lib/reports.ts` (`round1`) | Đổi `-0` thành `0` khi làm tròn (1 dòng) | **Đã sửa** — test chặn: `07-quan-ly` “Ngày HT TB không hiện “-0”…” |
| 2 | Trung bình | (Việc 31B) Trình phát Bunny có thể **không bao giờ báo “sẵn sàng”** → không ghi tiến độ xem: `player.js` được nạp động SAU khi iframe đã tải xong (mạng nhanh / có cache), mà Player.js chỉ gửi lệnh sau khi bắt được sự kiện `load` của iframe. | Bunny giả lập (iframe tải rất nhanh): học viên phát video, “Đã xem 0%” mãi | `src/components/video-player/bunny-player.tsx` | Nạp Player.js trước, gắn iframe sau và tạo Player ngay khi iframe vào DOM | **Đã sửa** — test chặn: `12-bunny` “học viên xem bằng trình phát Bunny giả…” |

Không phát hiện lỗi chức năng / phân quyền nào khác trong 10 luồng nghiệp vụ.

## Ghi chú khi viết test (không phải lỗi ứng dụng)

- **Form đăng nhập**: React 19 tự xoá ô của `<form action>` sau mỗi lần gửi (mật khẩu bị xoá sau khi báo lỗi — đúng mong muốn).
  Test gửi liên tiếp phải chờ form xoá xong rồi mới điền lần sau.
- **Danh sách phân trang**: dữ liệu tăng sau mỗi lượt chạy (công ty, người trong phòng KD, khoá trong thư viện) → test luôn lọc theo mã / tên
  (`?q=`) thay vì dựa vào trang 1.
- **Trang có `loading.tsx`**: nội dung stream sau khung “Đang tải…” → test chờ khung tải biến mất trước khi đọc chữ.
- **Dialog Base UI**: khi dialog mở, phần còn lại của trang bị ẩn khỏi cây trợ năng → chỉ tìm phần tử bên trong dialog.
- **Giới hạn đăng nhập** không bị tắt trong môi trường test: mỗi tài khoản đăng nhập từ 1 IP giả (`X-Forwarded-For`, `TRUST_PROXY=true`
  trong `.env.test`); test giới hạn / khoá tạm chạy cuối với tài khoản + IP riêng.
