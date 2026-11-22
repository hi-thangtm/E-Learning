# Báo cáo — định nghĩa chỉ số

Trang **Báo cáo** (`/reports`) dành cho Trưởng phòng, Admin công ty, Admin tập đoàn.
Định nghĩa dưới đây trùng với tooltip ⓘ ở tiêu đề cột và sheet **“Định nghĩa chỉ số”** khi xuất Excel.
Nguồn duy nhất trong code: `src/lib/report-definitions.ts` — sửa định nghĩa thì sửa ở đó và cập nhật tài liệu này.

## Ai thấy những gì (phạm vi)

| Vai trò | Thấy |
|---|---|
| Trưởng phòng (`MANAGER`) | Nhân viên các phòng mình làm trưởng **và mọi phòng con**. Không làm trưởng phòng nào → không có dữ liệu. |
| Admin công ty | Mọi nhân viên của công ty mình. |
| Admin tập đoàn | Toàn tập đoàn, hoặc 1 công ty chọn ở bộ lọc. |

Chỉ tính người **đang làm việc** (tài khoản hoạt động, công ty không tạm ngưng). Phạm vi lấy từ `getTeamScope` (`src/lib/scope.ts`).

## Bộ lọc chung

- **Phòng ban** — mặc định gồm cả phòng con (tắt “Gồm phòng con” để chỉ lấy đúng phòng đó).
- **Danh mục** — danh mục của khoá học.
- **Khoảng thời gian** — lọc theo **ngày giao** của lượt học (ngày lượt học được tạo), *không phải* ngày hoàn thành.
- **Nguồn** — mặc định chỉ tính khoá **được giao** (theo quy tắc hoặc giao thủ công). Bật “Gồm khoá tự đăng ký” để tính cả khoá học viên tự đăng ký.
- Lượt học **đã huỷ** không bao giờ được tính.
- Các số “quá hạn”, “còn N ngày”… tính **tại thời điểm xem / xuất** báo cáo.
- Tab **Chứng nhận** chỉ dùng bộ lọc phạm vi, phòng ban, danh mục (không dùng ngày giao / nguồn).

## Chỉ số về lượt học

| Chỉ số | Định nghĩa |
|---|---|
| Được giao | Số lượt học được giao (theo quy tắc hoặc thủ công), không tính lượt đã huỷ. Mặc định không tính khoá tự đăng ký. |
| Đang học | Đã bắt đầu, chưa hoàn thành, **chưa quá hạn**. |
| Chưa bắt đầu | Chưa mở bài nào, **chưa quá hạn**. |
| Hoàn thành | Đã học xong mọi bài. |
| Quá hạn | Có hạn **trước thời điểm xem** và chưa hoàn thành. (Đang học + Chưa bắt đầu + Hoàn thành + Quá hạn = Được giao.) |
| Tỷ lệ hoàn thành | Hoàn thành ÷ Được giao. |
| Số ngày hoàn thành TB | Trung bình (ngày hoàn thành − ngày được giao) của các lượt đã hoàn thành. |

## Chỉ số về bài kiểm tra

| Chỉ số | Định nghĩa |
|---|---|
| Điểm TB | Lấy điểm **cao nhất** của mỗi người ở từng bài kiểm tra, **chỉ tính lần làm thuộc phiên bản hiện tại** của khoá, rồi lấy trung bình (thang 100). |
| Đạt lần đầu | Trong số (người × bài kiểm tra) đã làm ở phiên bản hiện tại: tỷ lệ có **lần làm số 1** của phiên bản đó đạt điểm qua. |
| Điểm cao nhất | (Danh sách người của 1 khoá) điểm cao nhất của người đó ở các bài kiểm tra của khoá, phiên bản hiện tại. |

## Chỉ số khác

| Chỉ số | Định nghĩa |
|---|---|
| Đánh giá TB | Điểm sao trung bình (1–5) của **mọi** đánh giá học viên đã gửi cho khoá (không giới hạn theo phạm vi). |
| Số NV | Số nhân viên đang làm việc trong phạm vi / phòng ban. |
| Chứng nhận còn hạn | Số chứng nhận chưa bị thu hồi và chưa hết hạn (hoặc không thời hạn). |
| Lần học gần nhất | Lần gần nhất người đó có tiến độ ở một bài học bất kỳ. |

## Nắm quy trình mới nhất

Chỉ gồm khoá đã phát hành từ **phiên bản 2** trở lên và có người trong phạm vi từng học xong.

| Chỉ số | Định nghĩa |
|---|---|
| Bản hiện tại | Phiên bản đã phát hành mới nhất của khoá. |
| Bản mới nhất | Ngày phát hành và loại: **MINOR** (chỉ cần đọc phần thay đổi và xác nhận) · **MAJOR** (phải học lại). |
| Đã từng hoàn thành | Số người đã học xong khoá ở ít nhất một phiên bản. |
| Đã nắm bản mới nhất | Phiên bản đã nắm = phiên bản hiện tại (đã học xong bản này hoặc đã xác nhận bản MINOR). |
| Chưa xác nhận (MINOR) | Đã hoàn thành nhưng chưa bấm xác nhận bản cập nhật mới nhất. Nút **“Nhắc xác nhận”** gửi thông báo cho nhóm này (mỗi người 1 lần / ngày). |
| Đang học lại (MAJOR) | Từng hoàn thành nhưng phải học lại do bản MAJOR và chưa học xong. |
| Tỷ lệ đã nắm | Đã nắm bản mới nhất ÷ Đã từng hoàn thành. |

## Chứng nhận sắp hết hạn

- **30 / 60 / 90 ngày** — chứng nhận **mới nhất** của mỗi (người × khoá), chưa thu hồi, hết hạn trong khoảng đó tính từ hôm nay.
- **Đã hết hạn chưa học lại** — chứng nhận mới nhất của (người × khoá) đã hết hạn và chưa có chứng nhận mới hơn.
- **Còn (ngày)** — số ngày đến ngày hết hạn; số âm = đã hết hạn bấy nhiêu ngày.
- **Học lại** — trạng thái lượt học hiện tại của khoá (khi chứng nhận hết hạn, tác vụ hằng ngày tự giao học lại).

## Xuất Excel

- “Xuất Excel” ở mỗi tab xuất đúng bảng đang xem (theo bộ lọc, tìm kiếm, sắp xếp; ở màn chi tiết khoá thì xuất danh sách người).
- “Xuất toàn bộ” = 1 file: sheet **Thông tin** (người xuất, thời điểm, bộ lọc) + 5 sheet báo cáo + sheet **Định nghĩa chỉ số**.
- Tiêu đề in đậm, cố định dòng đầu; cột % định dạng phần trăm; ngày `dd/MM/yyyy` (giờ Việt Nam).
- Tên file: `BaoCao_<Tab>_<yyyyMMdd-HHmm>.xlsx`. Mỗi lần xuất ghi nhật ký `REPORT_EXPORTED` (tab, bộ lọc, số dòng).

## Dashboard tập đoàn (`/system/overview` — chỉ Admin tập đoàn)

Dùng cùng định nghĩa ở trên, tính trên **toàn tập đoàn** (người đang làm của công ty đang hoạt động), không lọc ngày giao. Nguồn: `src/lib/group-dashboard.ts`.

| Chỉ số | Định nghĩa |
|---|---|
| Khoá đang phát hành | Số khoá học ở trạng thái Đã phát hành (mọi công ty). |
| Tỷ lệ hoàn thành | Hoàn thành ÷ Được giao (chỉ khoá được giao, bỏ tự đăng ký). Bảng so sánh tô màu: xanh ≥ 90%, vàng 70–89%, đỏ < 70%. |
| Người quá hạn / % người quá hạn | Số nhân viên có ít nhất 1 khoá được giao đang quá hạn; ÷ Số nhân viên. |
| Tỷ lệ nắm quy trình mới | Trên các khoá đã có phiên bản ≥ 2: lượt đã nắm bản mới nhất ÷ lượt từng hoàn thành. |
| Chứng nhận còn hiệu lực | Chứng nhận chưa thu hồi, chưa hết hạn (hoặc không thời hạn) của người đang làm. |
| Người học 30 ngày qua / % | Nhân viên có tiến độ bài học cập nhật trong 30 ngày gần nhất; ÷ Số nhân viên. |
| Lượt hoàn thành theo tháng | Số lượt học có ngày hoàn thành trong từng tháng (giờ Việt Nam), 12 tháng gần nhất; mọi nguồn giao. |
| Khoá cần chú ý — quá hạn | 5 khoá có tỷ lệ (lượt quá hạn ÷ lượt được giao) cao nhất, chỉ xét khoá có ≥ 5 lượt được giao. |
| Khoá cần chú ý — nắm bản mới | 5 khoá (phiên bản ≥ 2) có tỷ lệ nắm bản mới nhất thấp nhất. |
