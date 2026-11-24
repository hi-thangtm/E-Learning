# Dữ liệu demo

Nạp lại bất cứ lúc nào (XOÁ SẠCH database trong `.env` rồi nạp — từ chối chạy với `elearning_test` / `elearning_perf`):

```bash
npm run demo:seed -- --yes
```

Script: `scripts/seed-demo.ts`. Ngẫu nhiên có hạt giống cố định → chạy lại ra cùng bộ dữ liệu; ngày giờ tính theo lúc chạy
(quá hạn, sắp hết hạn… luôn đúng so với hôm nay). Video là YouTube công khai (cần Internet).

**Mật khẩu mọi tài khoản: `123456789`** (không bắt đổi mật khẩu khi đăng nhập). Lưu ý: muốn đổi mật khẩu thì mật khẩu mới phải có cả chữ và số.

## Tài khoản

| Vai trò | Mã đăng nhập | Họ tên | Ghi chú |
|---|---|---|---|
| Admin tập đoàn | `ADMIN` | Trần Quốc Bảo | Có thông báo đề xuất cập nhật khoá IT-01 chờ duyệt |
| Admin tập đoàn | `GA02` | Lê Thu Hà | |
| Admin công ty | `CA-TONG` | Phạm Minh Đức | Công ty tổng |
| Admin công ty | `CA-TM` | Hoàng Thị Lan | HTTM — công ty nhiều dữ liệu nhất |
| Admin công ty | `CA-LOG`, `CA-SX`, `CA-BL`, `CA-XD`, `CA-CN`, `CA-BDS`, `CA-DV`, `CA-MT` | | `CA-MT` thuộc công ty đang **tạm ngưng** → không đăng nhập được |
| Biên soạn | `CE-TONG` | Ngô Thanh Tâm | Có 1 đề xuất MAJOR chờ duyệt + 1 bị từ chối (khoá IT-01) |
| Biên soạn | `CE-TM`, `CE-SX` | | |
| Trưởng phòng | `MG-KD` | Đặng Minh Khoa | Phòng Kinh doanh HTTM (3 cấp con) — đội đông nhất |
| Trưởng phòng | `MG-KDMB` | Phan Văn Hưng | Nhóm KD miền Bắc |
| Trưởng phòng | `MG-NS`, `MG-TCKT`, `MG-CNTT`, `MG-CSKH`, `MG-KHO`, `MG-SX`, `MG-QC`, `MG-CN` | | |
| Học viên | **`TM-001`** | Nguyễn Văn An | **Học viên mẫu đủ trạng thái** (xem dưới) |
| Học viên | `TM-002` | Trần Thị Bình | Xong lộ trình Kinh doanh, có khoá quá hạn |
| Học viên | `TM-015` | | Nhân viên mới vào 8 ngày, 3 khoá chưa bắt đầu |
| Học viên | `TM-004` | | Trượt 3 lượt bài kiểm tra “Bán hàng tư vấn”, được cấp thêm 1 lượt |
| Học viên | `SX-001` / `SX-002` | | Chứng nhận PCCC sắp hết hạn / đã hết hạn → phải học lại |
| Học viên | `TM-003`…`TM-013`, `TONG-001`…`006`, `LOG-001`…`007`, `SX-003`…`007`, `BL/XD/CN/BDS/DV/MT-001…003` | | |
| Đã khoá | `TM-014`, `SX-008` | | Nghỉ việc (INACTIVE) → không đăng nhập được, giữ lịch sử học |
| Khoá tạm | `LOG-008` | | Sai mật khẩu 5 lần, khoá tạm 10 phút sau khi nạp |

### Học viên mẫu `TM-001`
- **Lộ trình “Hội nhập Kinh doanh 30 ngày”**: Văn hoá (xong, có chứng nhận) → Kiến thức sản phẩm (đang học) → Bán hàng tư vấn, Quy trình CSKH (🔒 khoá).
- **An toàn lao động cơ bản**: đã xong bản cũ, có bản MAJOR → **đang học lại**.
- **Nội quy lao động**: đã xong, có bản MINOR → banner **“Quy trình có cập nhật”**, bấm “Xem thay đổi” để xác nhận.
- **Phòng cháy chữa cháy**: được giao tay, **quá hạn**.
- **Kỹ năng giao tiếp** (tự đăng ký, đang học), **Quản lý thời gian** (tự đăng ký, xong, có chứng nhận + đánh giá).
- Thông báo đủ loại, có tin chưa đọc.

## Số liệu

| Bảng | Số dòng | Có gì |
|---|---|---|
| Công ty | 10 | Tập đoàn Hưng Thịnh + 9 công ty con (1 tạm ngưng), mẫu chứng nhận riêng cho TONG / HTTM |
| Phòng ban | 35 | Cây 3 cấp (HTTM: Kinh doanh › Nhóm miền Bắc › Tổ Hà Nội), 1 phòng ngừng hoạt động |
| Chức danh / Danh mục | 12 / 11 | Mỗi loại có 1 mục đã ẩn |
| Người dùng | 80 | 2 GA, 10 CA, 3 CE, 10 trưởng phòng, 55 học viên |
| Khoá học | 19 | 15 đã phát hành, 2 nháp, 1 lưu trữ; 4 cho tự đăng ký; 8 có chứng nhận (6 / 12 tháng / vĩnh viễn) |
| Phiên bản | 24 | MINOR (NQ-01, TM-QT-01), MINOR + MAJOR (AT-01 v3), MAJOR (TM-SP-01), đề xuất chờ duyệt + bị từ chối (IT-01) |
| Chương / Bài | 89 / 120 | Video YouTube, tài liệu HTML, bài kiểm tra; AT-01 có chương / bài đã ẩn |
| Câu hỏi | 228 | 12 câu / khoá, có câu nhiều đáp án, câu đã tắt, câu AI “chờ duyệt” |
| Lộ trình | 10 | 8 phát hành, 1 nháp, 1 lưu trữ |
| Quy tắc giao | 14 | Theo công ty / phòng ban (gồm phòng con) / chức danh / lộ trình; 2 quy tắc đang tắt |
| Lượt học | ~400 | Đủ trạng thái, ~50 lượt quá hạn, ~15 huỷ giao |
| Tiến độ / Bài làm | ~1.700 / ~290 | Có bài làm bỏ dở (tác vụ hằng ngày sẽ chấm) |
| Chứng nhận | ~130 | Có thu hồi, sắp hết hạn, đã hết hạn |
| Đánh giá | ~115 | 1–5 sao, có nhận xét |
| Thông báo | ~650 | Đủ 13 loại, đã đọc / chưa đọc |
| Nhật ký | ~350 | Thao tác quản trị + 30 lần chạy tác vụ hằng ngày (1 lần có lỗi) |
| Cài đặt | 8 | Giá trị mặc định (logo để trống) |
