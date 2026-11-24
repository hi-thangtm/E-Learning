# Đặc tả chức năng — Module Đào tạo nhân viên (Phase 1)

Đi kèm: `docs/database.md` (quy tắc nghiệp vụ). Giao diện theo `docs/design-system.md` (học từ Vuexy, làm bằng Tailwind + shadcn/ui, desktop layout).

## 0. Nguyên tắc chung

- **5 vai trò cố định**, xếp theo bậc: Học viên → Quản lý → Biên soạn nội dung → Admin công ty con → Admin tập đoàn.
- **Ai cũng là học viên.** Admin, editor, quản lý đều có cổng học của mình. Vai trò cao hơn chỉ có **thêm menu**, không mất menu học.
- **Phạm vi dữ liệu:** Admin tập đoàn thấy toàn tập đoàn. Admin công ty con và Biên soạn chỉ thấy công ty mình. Quản lý chỉ thấy phòng ban mình và các phòng con.
- **Tài khoản do admin tạo** (thủ công hoặc import Excel). Chưa đồng bộ Lark ở phase 1.
- **Thông báo trong hệ thống** (chuông). Email để phase sau.
- **Không xoá dữ liệu nghiệp vụ**: chỉ khoá / lưu trữ / huỷ.
- **Mọi thao tác quản trị ghi nhật ký.**

## 1. Sơ đồ menu (sidebar)

| Nhóm menu | Học viên | Quản lý | Biên soạn | Admin công ty con | Admin tập đoàn |
|---|:-:|:-:|:-:|:-:|:-:|
| **Học tập** — Tổng quan, Khoá học của tôi, Lộ trình của tôi, Thư viện khoá học, Chứng nhận của tôi | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Theo dõi học tập** — Tổng quan tập đoàn (chỉ Admin tập đoàn), Tình hình học tập, Tiến độ từng người, Báo cáo | | phòng mình + phòng con | | cả công ty | toàn tập đoàn |
| **Giao khoá** — Giao khoá học, Quy tắc giao tự động | | | | ✓ | ✓ |
| **Soạn nội dung** — Khoá học, Ngân hàng câu hỏi, Lộ trình học, Danh mục khoá học | | | ✓ | ✓ | ✓ |
| **Tổ chức** — Công ty con (chỉ Admin tập đoàn), Người dùng, Phòng ban, Chức danh | | | | ✓ | ✓ |
| **Hệ thống** — Mẫu chứng nhận, Nhật ký thao tác, Tác vụ hằng ngày, Kết nối Lark, Cài đặt hệ thống | | | | Mẫu chứng nhận, Nhật ký thao tác | ✓ |

Đường dẫn của từng mục: `src/lib/roles.ts` (đổi nhãn / nhóm không đổi URL; nhãn mục menu = tiêu đề trang).
Bấm tên nhóm để thu gọn / mở (nhớ trên máy — localStorage); nhóm chứa trang đang mở luôn mở.
Tên cũ (trước 24/11/2026): “Đội của tôi” → Theo dõi học tập, “Tổng quan đội” → Tình hình học tập, “Nhân viên” (đội) → Tiến độ từng người,
“Nội dung” → Soạn nội dung, “Danh sách giao khoá” → Giao khoá học, “Giao tự động” → Quy tắc giao tự động.

## 2. Học viên (mọi nhân viên)

Tham khảo Vuexy: `apps/academy/dashboard`, `my-course`, `course-details`.

**2.1 Đăng nhập & tài khoản** *(đã làm)*
- Đăng nhập bằng mã nhân viên + mật khẩu.
- Lần đầu đăng nhập bắt buộc đổi mật khẩu.
- Hồ sơ: xem thông tin (công ty, phòng ban, chức danh), đổi mật khẩu.

**2.2 Tổng quan (trang chủ)**
- 4 thẻ số liệu: đang học, đã hoàn thành, quá hạn, chứng nhận.
- "Cần làm": khoá sắp đến hạn, xếp theo hạn gần nhất; khoá quá hạn tô đỏ.
- "Tiếp tục học": bài đang học dở, bấm là vào đúng vị trí video.
- Banner "Quy trình có cập nhật" khi có phiên bản MINOR chưa xác nhận.

**2.3 Khoá học của tôi**
- Tabs: Đang học / Chưa bắt đầu / Hoàn thành / Quá hạn.
- Card khoá: ảnh bìa, tên, thanh tiến độ %, hạn hoàn thành, nhãn *Bắt buộc* / *Được giao* / *Tự đăng ký*.
- Tìm kiếm, lọc theo danh mục.

**2.4 Trang học (trình phát)**
- Bên trái: video (Bunny Stream) hoặc tài liệu. Bên phải: mục lục chương → bài, có dấu ✓ bài đã xong, 🔒 bài chưa mở.
- Học tuần tự: bài sau mở khi bài trước xong.
- Video: nhớ vị trí xem, không cho tua vượt phần chưa xem, tự đánh dấu xong khi xem đủ % quy định.
- Tài liệu: nút "Đã đọc xong".
- Nút "Bài tiếp theo".
- Khi hoàn thành khoá: màn hình chúc mừng + nút tải chứng nhận + form đánh giá khoá (1–5 sao, nhận xét).

**2.5 Làm bài kiểm tra**
- Màn hình trước khi làm: số câu, thời gian, điểm đạt, số lần còn lại.
- Khi làm: đồng hồ đếm ngược, danh sách ô số câu (đã trả lời / chưa), chuyển câu tự do, câu một đáp án và nhiều đáp án.
- Hết giờ tự nộp. Cảnh báo trước khi nộp nếu còn câu chưa trả lời.
- Kết quả: điểm, đạt / không đạt, xem lại đáp án đúng (tuỳ cấu hình bài), nút làm lại nếu còn lượt.

**2.6 Lộ trình học**
- Danh sách lộ trình được giao; mỗi lộ trình hiển thị dạng timeline các khoá.
- Khoá sau chỉ mở khi khoá trước hoàn thành.

**2.7 Thư viện khoá học**
- Xem các khoá cho phép tự đăng ký (của tập đoàn + công ty mình).
- Lọc theo danh mục, tìm theo tên; trang giới thiệu khoá (mô tả, số bài, thời lượng); nút "Đăng ký học".

**2.8 Cập nhật quy trình**
- MAJOR: khoá tự chuyển về "Chưa bắt đầu", có hạn mới, nhận thông báo phải học lại.
- MINOR: banner + trang "Có gì thay đổi" (tóm tắt thay đổi) + nút "Tôi đã đọc và nắm được".

**2.9 Chứng nhận**
- Danh sách chứng nhận: khoá, phiên bản, ngày cấp, ngày hết hạn, trạng thái còn hạn / hết hạn.
- Tải PDF. Mỗi chứng nhận có mã số để tra cứu.

**2.10 Thông báo (chuông)**
- Được giao khoá mới, sắp đến hạn (trước 3 ngày), đã quá hạn, quy trình có phiên bản mới, chứng nhận sắp hết hạn.
- Đánh dấu đã đọc / đọc tất cả.

## 3. Quản lý (trưởng bộ phận)

Có toàn bộ chức năng Học viên, thêm nhóm menu **Theo dõi học tập** (Tình hình học tập, Tiến độ từng người, Báo cáo). Phạm vi: các phòng mình làm trưởng + phòng con. **Chỉ xem và nhắc**, không tạo / giao khoá.

**3.1 Tình hình học tập** (trước gọi “Tổng quan đội”)
- Tỷ lệ hoàn thành khoá bắt buộc của đội.
- Số người quá hạn; danh sách "chưa nắm quy trình mới nhất".
- Biểu đồ tiến độ theo khoá.

**3.2 Nhân viên**
- Bảng nhân viên: tên, phòng ban, số khoá được giao / đã xong / quá hạn.
- Bấm vào 1 người → xem chi tiết từng khoá, điểm kiểm tra, chứng nhận.
- Nút "Nhắc nhở": gửi thông báo cho người đang quá hạn (từng người hoặc chọn nhiều).
- Xuất Excel báo cáo đội.

## 4. Biên soạn nội dung

Có toàn bộ chức năng Học viên, thêm nhóm menu **Soạn nội dung**. Phạm vi: nội dung của công ty mình.

**4.1 Danh mục khoá học**
- Thêm / sửa / ẩn danh mục.

**4.2 Khoá học — danh sách**
- Bảng: tên, danh mục, trạng thái (Nháp / Đã phát hành / Lưu trữ), phiên bản hiện tại, số học viên, cập nhật lần cuối.
- Lọc theo trạng thái, danh mục.

**4.3 Khoá học — trình soạn (dạng tabs)**
- *Thông tin:* tên, mô tả, ảnh bìa, danh mục, cho phép tự đăng ký hay không, thời hạn chứng nhận (tháng, để trống = vĩnh viễn).
- *Nội dung:* thêm chương, thêm bài; kéo thả sắp xếp. Loại bài:
  - **Video:** tải video lên Bunny, xem tiến trình xử lý, đặt % xem tối thiểu.
  - **Tài liệu:** tải PDF hoặc soạn nội dung văn bản.
  - **Bài kiểm tra:** chọn chủ đề câu hỏi từ ngân hàng của khoá (hoặc tất cả), số câu rút ngẫu nhiên, thời gian, điểm đạt, số lần làm tối đa, có cho xem đáp án hay không.
- *Xem trước:* xem khoá đúng như học viên thấy.
- *Đánh giá:* xem điểm sao và nhận xét của học viên.

**4.4 Phát hành**
- Phát hành lần đầu.
- Phát hành bản cập nhật **MINOR** (đọc & xác nhận): nhập tóm tắt thay đổi.
- Bản **MAJOR** (học lại toàn bộ): Biên soạn **chỉ được đề xuất**; Admin bấm phát hành (vì MAJOR đặt lại tiến độ của nhiều người).
- Lưu trữ khoá (ẩn khỏi thư viện, không xoá).

**4.5 Ngân hàng câu hỏi** (theo từng khoá học)
- Thêm câu hỏi: nội dung, ảnh (tuỳ chọn), chủ đề, loại một / nhiều đáp án, các phương án, đáp án đúng, giải thích.
- Import từ Excel theo file mẫu.
- Bật / tắt câu hỏi.
- (Phase 2: AI tự sinh câu hỏi từ tài liệu.)

**4.6 Lộ trình học**
- Tạo lộ trình, chọn và sắp xếp thứ tự các khoá.

## 5. Admin công ty con

Có toàn bộ chức năng Biên soạn + quyền xem như Quản lý cho **cả công ty**, thêm:

**5.1 Người dùng**
- Bảng nhân viên công ty: mã NV, tên, phòng ban, chức danh, vai trò, trạng thái.
- Thêm thủ công; import Excel (file mẫu, báo lỗi từng dòng trước khi lưu).
- Sửa thông tin, chuyển phòng ban / chức danh (tự chạy lại quy tắc giao khoá).
- Gán vai trò: Học viên, Quản lý, Biên soạn, Admin công ty con (không được gán Admin tập đoàn).
- Khoá / mở tài khoản (nghỉ việc → khoá, không xoá).
- Đặt lại mật khẩu (buộc đổi ở lần đăng nhập sau).

**5.2 Phòng ban & chức danh**
- Cây phòng ban (thêm / sửa / kéo thả đổi cấp), chỉ định trưởng phòng.
- Danh sách chức danh (dùng chung toàn tập đoàn — chỉ Admin tập đoàn sửa, Admin công ty con xem).

**5.3 Giao khoá**
- **Giao thủ công:** chọn khoá hoặc lộ trình → chọn người (lọc theo phòng ban, chức danh) → đặt hạn → xác nhận.
- **Quy tắc bắt buộc:** "Mọi người thuộc phòng X / chức danh Y phải học khoá Z trong N ngày". Áp dụng cho cả người vào sau.
- Xem trước số người bị ảnh hưởng trước khi lưu.
- Huỷ giao, gia hạn cho từng người.

**5.4 Phát hành MAJOR**
- Duyệt đề xuất MAJOR của Biên soạn hoặc tự phát hành.
- Màn hình xác nhận cho thấy: bao nhiêu người sẽ phải học lại, hạn mới.

**5.5 Báo cáo (công ty mình)**
- Theo khoá: số được giao / đang học / hoàn thành / quá hạn, điểm trung bình.
- Theo phòng ban: tỷ lệ hoàn thành.
- Theo người: lịch sử học, điểm, chứng nhận.
- Tình trạng nắm quy trình mới nhất.
- Chứng nhận sắp hết hạn.
- Xuất Excel mọi báo cáo.

**5.6 Mẫu chứng nhận & Nhật ký**
- Chỉnh mẫu chứng nhận của công ty (logo, người ký, chức vụ, ảnh chữ ký).
- Nhật ký thao tác của công ty: ai, làm gì, lúc nào.

## 6. Admin tập đoàn (công ty tổng)

Có toàn bộ chức năng Admin công ty con, phạm vi **toàn tập đoàn**, thêm:

**6.1 Công ty con**
- Tạo / sửa / tạm ngưng công ty con.
- Chỉ định Admin công ty con.

**6.2 Nội dung cấp tập đoàn**
- Khoá học, lộ trình do công ty tổng tạo → mọi công ty con đều thấy.
- Quy tắc bắt buộc toàn tập đoàn (vd: "mọi nhân viên toàn tập đoàn học Quy chế ATTT trong 30 ngày", hoặc theo công ty / chức danh).

**6.3 Dashboard tập đoàn**
- So sánh tỷ lệ hoàn thành khoá bắt buộc giữa các công ty con.
- Tìm nhanh bất kỳ nhân viên nào.

**6.4 Hệ thống**
- Cài đặt chung: tên hệ thống, logo, mẫu chứng nhận mặc định, mặc định hạn hoàn thành, mặc định % xem video.
- Nhật ký toàn hệ thống.

## 7. Hệ thống tự động (chạy ngầm)

- Khi tạo / sửa quy tắc giao, khi thêm nhân viên, khi đổi phòng ban / chức danh → tự giao khoá.
- Hằng ngày: gửi thông báo sắp hạn / quá hạn; chứng nhận hết hạn → đặt lại khoá để học lại.
- Khi phát hành MAJOR / MINOR → cập nhật trạng thái học + gửi thông báo.

## 8. Thứ tự làm

1. ✅ Nền tảng: đăng nhập, đổi mật khẩu, phân quyền theo vai trò, layout + menu.
2. Thiết kế: `docs/design-system.md` + theme + layout theo Vuexy.
3. Tổ chức & người dùng (5.1, 5.2, 6.1) — cần có người trước mới giao được khoá. Sau đó import Excel.
4. Nội dung: danh mục, khoá, chương / bài, video Bunny, tài liệu (4.1–4.3).
5. Cổng học viên: tổng quan, khoá của tôi, trang học (2.2–2.4).
6. Ngân hàng câu hỏi & bài kiểm tra (4.5, 2.5).
7. Giao khoá & quy tắc bắt buộc (5.3), thông báo (2.10), tác vụ tự động (7).
8. Phiên bản MAJOR / MINOR (4.4, 5.4, 2.8), chứng nhận (2.9, 5.6).
9. Lộ trình, thư viện tự đăng ký, đánh giá (2.6, 2.7, 4.6).
10. Đội của tôi & báo cáo, xuất Excel (3, 5.5, 6.3), nhật ký.

## Ngoài phạm vi phase 1

Module đào tạo đối tác và khách hàng; AI sinh câu hỏi; đồng bộ Lark; gửi email; giao diện mobile.
