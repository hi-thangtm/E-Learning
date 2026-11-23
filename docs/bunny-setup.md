# Cài đặt video Bunny Stream

Hướng dẫn cho người vận hành hệ thống. Làm một lần khi đưa hệ thống vào dùng, khoảng **30 phút**.

Bunny Stream là dịch vụ lưu và phát video. Video tải lên Bunny chỉ người đã đăng nhập hệ thống mới xem được. Link xem tự hết hạn sau 6 giờ và không tải file về được.
Nếu chưa cài Bunny, Biên soạn vẫn dùng được video YouTube (chế độ Không công khai, kém bảo mật hơn). Khi đó lựa chọn “Bunny Stream” trong bài Video sẽ bị khoá.

> Tên nút và mục trong trang quản trị Bunny có thể thay đổi theo thời gian. Nếu không thấy đúng tên dưới đây, tìm mục có nghĩa tương tự,
> hoặc xem tài liệu của Bunny: bunny.net/docs (phần Stream).

---

## 1. Tạo tài khoản và thư viện video

1. Vào **bunny.net** → **Sign up**. Đăng ký bằng email của công ty, xác nhận email, rồi thêm thẻ thanh toán.
   Bunny cho dùng thử 14 ngày, sau đó tính theo mức dùng thực tế (xem mục 7).
2. Trong trang quản trị Bunny, chọn **Stream** → **Add Video Library**.
   - **Name**: đặt tên dễ nhận ra, VD `elearning-tap-doan`.
   - **Vùng lưu trữ (Storage / Replication regions)**: chọn **Singapore (SG)**, vùng gần Việt Nam nhất nên video tải nhanh.
     Có thể thêm 1 vùng dự phòng. Mỗi vùng thêm làm tăng phí lưu trữ.
3. Bấm **Add Video Library**.

## 2. Lấy các khoá

Mở thư viện vừa tạo. Chép 4 giá trị sau vào một chỗ an toàn, **không gửi qua chat / email thường**:

| Giá trị | Ở đâu trong Bunny | Biến trong file `.env` |
|---|---|---|
| **Library ID** (một dãy số) | thư viện › **API** › *Access Credentials* › “Video library ID” | `BUNNY_STREAM_LIBRARY_ID` |
| **API Key** | thư viện › **API** › *Access Credentials* › “Api Key” | `BUNNY_STREAM_API_KEY` |
| **Read-Only API Key** (tuỳ chọn, nên có) | thư viện › **API**, ngay cạnh API Key | `BUNNY_STREAM_READONLY_KEY` |
| **Token authentication key** | thư viện › **Security** › thẻ “Token authentication key” | `BUNNY_STREAM_TOKEN_KEY` |

Lưu ý:
- Dùng **API Key của thư viện**. Không dùng API Key của cả tài khoản (Account settings), vì Bunny sẽ báo “sai API key”.
- Ô “Token authentication key” trong Bunny có ghi chữ “API key”, nhưng đó là một khoá **khác** với API Key của thư viện. Chép đúng ô.
- Read-Only API Key dùng để kiểm chữ ký các thông báo (webhook) Bunny gửi về. Để trống thì hệ thống vẫn chạy bình thường, vì nó luôn tự hỏi lại Bunny trạng thái thật của video.

## 3. Bật bảo mật trong Bunny

Trong thư viện:

1. **Security**
   - Bật **Token Authentication** cho trình phát nhúng (*Embed view token authentication*). Không bật thì ai có link nhúng cũng xem được video.
   - **Allowed domains**: thêm tên miền của hệ thống, **không** có `https://`, VD `daotao.congty.vn`.
     Thêm cả tên miền dùng thử nếu có.
   - Bật **Block Direct URL File Access**: chặn mở thẳng file video / ảnh trên máy chủ Bunny.
   - *MediaCage DRM* (bản cơ bản, miễn phí): có thể bật để chống tải video thêm một lớp.
2. **Encoding**
   - **Tắt Enable MP4 Fallback**. Khi bật, Bunny tạo file MP4 tải về được.
   - **Tắt Enable Early-Play**. Khi bật, Bunny lộ file gốc trong lúc xử lý.
   - *Enabled Resolutions*: giữ 360p, 720p, 1080p là đủ cho video đào tạo.
3. **API** › **Webhook URL**: dán địa chỉ
   ```
   https://<tên miền hệ thống>/api/bunny/webhook
   ```
   Lấy đúng địa chỉ này (kèm nút Sao chép) ở hệ thống: **Hệ thống › Cài đặt › Video Bunny Stream**.
   Webhook giúp bài video tự chuyển sang “sẵn sàng” ngay khi Bunny xử lý xong. Nếu thiếu webhook, hệ thống vẫn tự cập nhật
   khi người soạn mở lại trang hoặc khi tác vụ hằng ngày chạy, chỉ chậm hơn.

## 4. Điền vào máy chủ

1. Mở file `.env` trên máy chủ, cùng thư mục với `docker-compose.yml`, rồi điền:
   ```
   BUNNY_STREAM_LIBRARY_ID=123456
   BUNNY_STREAM_API_KEY=...
   BUNNY_STREAM_TOKEN_KEY=...
   BUNNY_STREAM_READONLY_KEY=...
   ```
   **Để trống** 3 biến `BUNNY_API_BASE`, `BUNNY_TUS_ENDPOINT`, `BUNNY_EMBED_HOST`. Ba biến này chỉ dùng khi kiểm thử với máy Bunny giả lập.
2. Kiểm tra `APP_URL` đúng địa chỉ thật của hệ thống, VD `https://daotao.congty.vn`. Hệ thống dùng nó để tạo địa chỉ webhook.
3. Khởi động lại ứng dụng: `docker compose up -d` (hoặc theo cách triển khai đang dùng).

## 5. Kiểm tra kết nối

Đăng nhập bằng tài khoản **Admin tập đoàn** → **Hệ thống › Cài đặt** → thẻ **Video Bunny Stream** → bấm **Kiểm tra kết nối**.

| Kết quả | Ý nghĩa / cách xử lý |
|---|---|
| **Đã kết nối · N video** | Xong. |
| **Chưa cấu hình** | Thiếu 1 trong 3 biến bắt buộc, hoặc Library ID không phải số. Kiểm tra `.env` rồi khởi động lại. |
| **Lỗi: sai API key** | Chép lại API Key **của thư viện** (mục 2). |
| **Lỗi: sai Library ID** | Chép lại Library ID của đúng thư viện. |
| **Lỗi: không gọi được Bunny** | Máy chủ không ra được Internet, tường lửa chặn `video.bunnycdn.com`, hoặc Bunny đang sự cố. Thử lại sau. |

Trang này chỉ hiện 4 ký tự cuối của mỗi khoá. Mỗi lần kiểm tra được ghi vào **Nhật ký**, chỉ ghi kết quả, không ghi khoá.
“Kiểm tra kết nối” chưa kiểm được Token key. Token key được kiểm khi xem thử video ở mục 6.

## 6. Thử lần đầu

1. Đăng nhập bằng tài khoản **Biên soạn** → tạo một khoá nháp → thêm bài **Video** → chọn **Bunny Stream** → chọn một file MP4 ngắn (1–2 phút).
   - Thanh tiến độ chạy tới 100%, rồi hiện “Bunny đang xử lý video...”.
   - Sau vài phút (tuỳ độ dài video), bài chuyển sang có trình phát và hiện thời lượng.
2. Phát hành khoá rồi giao cho một tài khoản **học viên** thử.
3. Đăng nhập bằng học viên đó → mở bài video trên **máy tính và điện thoại**:
   - Video phát được, phần “Đã xem …%” tăng dần.
   - Kéo tua vượt quá phần đã xem → bị kéo về.
   - Xem đủ phần trăm yêu cầu → bài hoàn thành.
4. Thử chặn:
   - Chép link trình phát (chuột phải vào video → Inspect, tìm `player.mediadelivery.net/embed/...`) rồi mở ở trình duyệt khác **sau 6 giờ**:
     phải báo lỗi / không phát.
   - Gỡ tên miền của hệ thống khỏi *Allowed domains* → video trong hệ thống phải bị chặn. Nhớ thêm lại tên miền sau khi thử.

## 7. Chi phí ước tính

> **Kiểm tra bảng giá hiện hành tại bunny.net/pricing/stream** trước khi trình duyệt. Giá dưới đây lấy ngày 23/11/2026.

| Khoản | Giá tham khảo |
|---|---|
| Xử lý (mã hoá) video | **Miễn phí** (gói thường) |
| Lưu trữ | ~ **$0,01 / GB / tháng** cho mỗi vùng (thêm vùng dự phòng: +$0,005–0,01 / GB) |
| Phát video (băng thông) — châu Á | ~ **$0,03 / GB** (mạng Standard) |
| Mức tối thiểu | **$1 / tháng** |

**Ví dụ:** 50GB video (khoảng 100 video × 500MB, lưu 1 vùng). 1.000 lượt xem / tháng, mỗi lượt khoảng 15 phút ở 720p (~170MB).
- Lưu trữ: 50 × $0,01 = **$0,5**
- Phát: 1.000 × 0,17GB = 170GB × $0,03 = **$5,1**
- Tổng **khoảng $6 / tháng**.

Phần lớn chi phí nằm ở phát video, nên chi phí tăng theo số lượt xem và độ phân giải.

**Xem chi phí thật:** trang quản trị Bunny › **Billing** (số dư, hoá đơn theo tháng) và thư viện › **Statistics** (băng thông, lượt xem, dung lượng).
Nên đặt **cảnh báo số dư** (Billing › Notifications) để không bị dừng dịch vụ khi hết tiền.

## 8. Sự cố thường gặp

| Hiện tượng | Nguyên nhân hay gặp |
|---|---|
| Lựa chọn “Bunny Stream” bị khoá, ghi “Chưa cấu hình” | Thiếu biến trong `.env` hoặc chưa khởi động lại sau khi sửa. |
| Bài kẹt “đang xử lý” lâu | Video dài cần nhiều thời gian. Nếu Bunny đã xử lý xong mà bài vẫn kẹt: webhook chưa dán hoặc sai địa chỉ. Mở lại trang soạn khoá để hệ thống tự hỏi lại Bunny, hoặc chờ tác vụ hằng ngày. |
| Học viên thấy khung đen / “Không tải được trình phát Bunny” | Token key sai, chưa thêm tên miền vào *Allowed domains*, hoặc học viên mở bài quá 6 giờ không tải lại trang. |
| “Bạn đã tạo quá 20 lượt tải video trong 1 giờ” | Giới hạn chống tạo video rác. Chờ 1 giờ hoặc dùng tài khoản Biên soạn khác. |
| Video tải dở (đóng trình duyệt giữa chừng) | Tác vụ hằng ngày tự xoá trên Bunny sau 24 giờ. |

---

*Thông tin kỹ thuật cho lập trình viên:* `src/lib/bunny.ts` (API, TUS, token, webhook), `src/lib/bunny-sync.ts` (cập nhật trạng thái),
`docs/database.md` Quy tắc 4. Kiểm thử bằng máy Bunny giả lập: `e2e/mock-bunny/`, `e2e/12-bunny.spec.ts` (`docs/test-scenarios.md`).
