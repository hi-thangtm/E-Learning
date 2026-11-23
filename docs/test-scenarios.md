# Kịch bản kiểm thử

Bộ kiểm thử toàn luồng (end-to-end) bằng Playwright, chạy trên **bản production** (`next build` + `next start -p 3200`)
với **database riêng `elearning_test`** (cùng container Postgres). Script từ chối chạy nếu tên database không phải `elearning_test`.

## Cách chạy

```bash
# Lần đầu trên máy
npx playwright install chromium   # tải trình duyệt Chromium cho Playwright
npm run test:env                  # tạo .env.test từ .env (DB elearning_test, AUTH_SECRET / CRON_SECRET riêng, cổng 3200)

# Mỗi lần kiểm thử (≈ 1–3 phút)
npm run test:e2e                  # seed lại elearning_test + build + chạy toàn bộ

# Xem từng bước (giao diện Playwright: chọn test, xem ảnh từng bước, DOM, mạng)
npm run build && npm run test:e2e:ui

# Chạy 1 file / 1 test
npx playwright test e2e/04-hoc-vien.spec.ts
npx playwright test -g "bài kiểm tra"

# Xem báo cáo HTML lần chạy gần nhất (ảnh chụp + trace của test lỗi)
npx playwright show-report
```

- `npm run test:seed` — chỉ dựng lại database: tạo `elearning_test` nếu chưa có → `prisma migrate deploy` → xoá sạch → seed nhỏ cố định.
  Mật khẩu mọi tài khoản thử: `Test12345`.
- Server test chạy ở cổng **3200** (không đụng `next dev` cổng 3000). Xem log server: `E2E_SERVER_LOGS=1 npx playwright test`.
- Cửa sổ `test:e2e:ui` giữ server cổng 3200 tới khi đóng → **đóng UI trước khi chạy `test:e2e`** (và ngược lại).
  `test:e2e` / `test:e2e:ui` kiểm tra cổng trước khi seed và báo rõ tiến trình đang chiếm (`scripts/test/check-port.ts`).
  Không bật `reuseExistingServer`: server lạ ở cổng này có thể nối tới database khác.
- Test lỗi: ảnh chụp + trace ở `test-results/`, mở bằng `npx playwright show-trace <file trace.zip>`.
- Giới hạn đăng nhập **không** bị tắt: `.env.test` đặt `TRUST_PROXY=true`, mỗi tài khoản đăng nhập với `X-Forwarded-For` riêng
  (giả lập nhiều máy). Test giới hạn / khoá tạm dùng tài khoản + IP riêng và chạy cuối (project `chay-cuoi`).
- Mỗi test tự tạo dữ liệu có mã riêng (`E2E-xxxxxx`) → chạy song song 3 luồng, chạy lại nhiều lần không cần seed lại.
- **Bunny Stream giả lập** (`e2e/mock-bunny/server.ts`, cổng 3201) chạy kèm app; `.env.test` có `BUNNY_*` trỏ vào đó (`npm run test:env` tự thêm).
  `npm run test:e2e:no-bunny` chạy toàn bộ khi KHÔNG cấu hình Bunny (test Bunny tự bỏ qua, test “Chưa cấu hình” chạy).

## Dữ liệu seed (`scripts/seed-test.ts`)

| Nhóm | Nội dung |
|---|---|
| Công ty | TONG (Tập đoàn Thử), CTY1, CTY2 |
| Phòng ban CTY1 | KD Phòng Kinh doanh (trưởng phòng TEST-MG1) ⊃ KD-N1 Nhóm Kinh doanh 1; KT Phòng Kế toán |
| Tài khoản | TEST-GA (Admin tập đoàn), TEST-CA1 / TEST-CA2 (Admin CTY1 / CTY2), TEST-CE1 (Biên soạn CTY1), TEST-MG1 (Trưởng phòng KD), TEST-LN1…LN5 (học viên trong đội: LN3, LN4 ở phòng con), TEST-OUT (Kế toán — ngoài đội), TEST-CTY2-LN, TEST-NEW (bắt đổi mật khẩu), TEST-LOCK / TEST-RESET (huỷ phiên), TEST-RATE (khoá tạm), TEST-SEC-LN/MG/CE/CA (phân quyền) |
| Khoá học | TEST-TU-DANG-KY (cho tự đăng ký), lộ trình TEST-LT gồm TEST-LT-1 → TEST-LT-2 |

## Kịch bản tự động

| File | Kịch bản | Kiểm gì |
|---|---|---|
| `global.setup.ts` | Đăng nhập | Mỗi tài khoản đăng nhập 1 lần qua API Auth.js, lưu phiên (`e2e/.auth/`) |
| `01-to-chuc.spec.ts` | Dựng tổ chức | GA tạo công ty con + tài khoản admin (bắt đổi mật khẩu); CA tạo phòng cha / con + chỉ định trưởng phòng → vai trò Trưởng phòng; import nhân viên từ file Excel tạo trong test; GA đổi tên hệ thống → sidebar, tiêu đề, trang đăng nhập đổi theo |
| `02-soan-khoa.spec.ts` | Soạn khoá | CE tạo khoá, chương, bài tài liệu + tải PDF, bài video YouTube (thời lượng đo bằng trình phát; không đo được → điền qua DB và ghi chú), bài kiểm tra; phát hành bị chặn khi ngân hàng thiếu câu; import câu hỏi Excel → phát hành v1 |
| `03-giao-khoa.spec.ts` | Giao khoá | Quy tắc theo phòng ban gồm / không gồm phòng con; người mới vào phòng + người chuyển phòng tự được giao; giao thủ công → gia hạn → huỷ giao |
| `04-hoc-vien.spec.ts` | Học viên | Bắt đổi mật khẩu lần đầu; học tuần tự (bài sau khoá), tài liệu đủ 15 giây; tiến độ video qua `/api/learn/progress` (trần thời gian thực, chặn Origin lạ); bài kiểm tra trượt chưa hiện đáp án → đạt mới hiện; hoàn thành → chứng nhận → tải PDF (`%PDF-`) → `/verify` khi chưa đăng nhập (không lộ mã NV) → đánh giá khoá |
| `05-phien-ban.spec.ts` | Phiên bản | MINOR → thông báo → học viên đọc + xác nhận → `acknowledgedVersion`; MAJOR: CE đề xuất → CA duyệt → học lại, giữ `completedVersion` + chứng nhận cũ (Quy tắc 2) |
| `06-thu-vien-lo-trinh.spec.ts` | Thư viện + lộ trình | Tự đăng ký (không hạn) → huỷ đăng ký; khoá sau của lộ trình bị khoá đến khi xong khoá trước (gõ thẳng URL cũng bị chuyển về) |
| `07-quan-ly.spec.ts` | Quản lý | Trưởng phòng thấy đúng đội (gồm phòng con, không có người ngoài đội / công ty khác); lọc Quá hạn; khoá tự đăng ký không đổi số được giao / tỷ lệ; nhắc nhở (lần 2 trong ngày bỏ qua); báo cáo Theo khoá học khớp số đếm DB; xuất Excel đọc lại bằng exceljs; “Ngày HT TB” không hiện “-0” |
| `08-tac-vu.spec.ts` | Tác vụ hằng ngày | Đổi `DUE_SOON_DAYS` = 5, chu kỳ quá hạn = 2 trong Cài đặt; nhắc sắp hạn (4 ngày: có, 7 ngày: không), quá hạn ngày đầu (w0) và theo chu kỳ (w2), lượt đã xong không bị nhắc, chứng nhận hết hạn sau 20 ngày (có) / 40 ngày (không); chạy 2 lần không gửi trùng; học viên thấy thông báo |
| `09-phan-quyen.spec.ts` | Phân quyền | URL ngoài quyền của từng vai trò (bảng mục 2 `docs/security-review.md`) → về Tổng quan; route xuất file / API → chặn; CA1 mở người CTY2, trưởng phòng mở người ngoài đội → chặn; khoá tài khoản / đặt lại mật khẩu → phiên đang mở bị đẩy ra; đăng nhập sai không lộ trạng thái tài khoản |
| `10-nhat-ky.spec.ts` | Nhật ký | Tạo công ty, phòng ban, người dùng, đặt lại mật khẩu, khoá, tạo khoá, giao / gia hạn / huỷ giao, nhắc nhở → đúng 1 dòng `audit_logs` đúng actor / action / entity / công ty; trang Nhật ký: CA1 thấy, CA2 không thấy |
| `11-dien-thoai.spec.ts` | Điện thoại (375px) | Trang học viên không cuộn ngang; menu ☰ mở / chuyển trang / tự đóng; học bài tài liệu + làm bài kiểm tra trên màn nhỏ (ô đáp án ≥ 44px) |
| `12-bunny.spec.ts` | Video Bunny Stream (giả lập) | Tải lên → PROCESSING → webhook → READY + thời lượng → phát hành; không webhook / đóng dialog → tác vụ hằng ngày + mở trang tự cập nhật; video lỗi → FAILED + chặn phát hành; khoá đã phát hành có video đang xử lý → chặn bản cập nhật; thay video xoá video cũ, xoá hẳn bài xoá video, ẩn bài giữ video; #8 vé dùng 1 lần, tải lại xoá video chờ, chờ > 24 giờ bị dọn; học viên xem trình phát giả (tiến độ theo thời gian thực, tua vượt bị kéo về, đủ % hoàn thành, token hết hạn 403); webhook giả mạo không đổi dữ liệu; Cài đặt kiểm tra kết nối đúng / sai key / sai thư viện, không lộ khoá |
| `99-bunny-gioi-han.spec.ts` | Giới hạn tạo video Bunny (chạy cuối) | Quá 20 lần / giờ / người → thông báo tiếng Việt |
| `99-gioi-han-dang-nhap.spec.ts` | Giới hạn đăng nhập (chạy cuối) | 10 lần / phút / IP; 5 lần / phút / mã NV (kể cả mã không tồn tại); sai 5 lần → khoá tạm 15 phút, chỉ báo khoá khi nhập đúng mật khẩu |

## Kiểm tay

Những phần cần mắt người / thiết bị thật — chạy trước mỗi lần phát hành:

- ☐ **Video YouTube**: mở bài video, video phát được; xem ~1 phút → thanh tiến độ bài tăng; tua nhanh không được tính; xem đủ % yêu cầu → bài hoàn thành.
- ☐ **PDF trong bài học**: bài tài liệu có PDF hiển thị trong trang (cuộn, phóng to), tải về được.
- ☐ **Excel xuất ra**: mở bằng Microsoft Excel thật các file Báo cáo (từng tab + Toàn bộ), Đội của tôi, Nhật ký, câu hỏi — không báo lỗi sửa file, tiếng Việt có dấu đúng, cột ngày / số đúng định dạng.
- ☐ **PDF chứng nhận**: tải chứng nhận → bố cục đúng mẫu (logo, tên, khoá, ngày cấp / hết hạn, chữ ký, mã tra cứu), tiếng Việt có dấu, in A4 ngang không lệch.
- ☐ **`/verify/<mã>` trên điện thoại**: quét / mở link trên điện thoại → hiển thị gọn, đúng trạng thái (còn hạn / hết hạn / thu hồi).
- ☐ **Thông báo**: chuông có số chưa đọc; bấm thông báo đi đúng trang; đánh dấu đã đọc; nội dung tiếng Việt đúng (sắp hạn, quá hạn, cập nhật khoá, chứng nhận).
- ☐ **Bunny Stream thật** (chỉ làm được khi có tài khoản — xem `docs/bunny-setup.md` mục “Thử lần đầu”): “Kiểm tra kết nối” → Đã kết nối;
  tải 1 video thật (vài trăm MB) → xử lý xong tự chuyển READY (webhook thật, có chữ ký); học viên xem trên máy tính + iPhone (Safari) + Android,
  tiến độ tăng, tua vượt bị kéo về; mở link embed ở trình duyệt khác / tên miền khác → bị chặn (token, Allowed domains);
  mở thẳng file video / ảnh trên CDN → 403 (Block Direct URL File Access); không có nút tải video; xem chi phí trong Bunny sau 1 tuần.
