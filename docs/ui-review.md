# Rà giao diện từng trang (Việc 32 — Phần 4)

Ngày rà: 23/11/2026. Trạng thái: **Đã sửa hết ở Việc 33** (23/11/2026) — cột Trạng thái ghi cách sửa; “đã có sẵn” = khi rà lại thấy đã đúng.

## Cách rà

- Dữ liệu: `elearning_perf` scale 1 + `--extreme` (`npm run perf:seed -- --scale 1 --extreme`): 1.000 người, 28k lượt học,
  thêm người tên 80 ký tự (PERF-X-LONG), khoá tên 200 ký tự (PERF-X-LONG-COURSE), khoá nháp 0 bài (PERF-X-EMPTY),
  người 0 khoá (PERF-X-NOCOURSE), phòng ban 5 cấp XL1…XL5 (trưởng phòng PERF-X-MG), thông báo rất dài.
- Chụp ảnh mọi trang trong `src/lib/roles.ts` + trang con theo từng vai trò: `scripts/ui-review/shots.ts`
  (1440px; trang học viên thêm 375px). Kết quả đo: **không trang nào cuộn ngang cả trang** ở 375px (trang quản trị cuộn trong khung).
- Đọc code từng trang theo checklist: tiêu đề + breadcrumb, 4 trạng thái (đang tải / rỗng / lỗi / có dữ liệu), nút đang xử lý,
  toast, dữ liệu dài / lớn, định dạng, thuật ngữ (design-system mục 9), căn lề so với design-system, bàn phím, điện thoại.
- Bàn phím (kiểm bằng script trên 5 dialog: chức danh, danh mục, người dùng, phòng ban, công ty): mở dialog focus đúng ô đầu,
  Esc đóng, Enter trong ô gửi form; Tab tới nút icon hiện tooltip tiếng Việt.

Mức: **Cao** = người dùng hiểu sai hoặc không làm được · **Trung bình** = xấu, khó dùng · **Thấp** = chi tiết.

## Tổng hợp

| Mức | Số mục |
|---|---|
| Cao | 10 |
| Trung bình | 28 |
| Thấp | 40 |
| **Tổng** | **78** |
| Lỗi chức năng (mục riêng, đã sửa ở Việc 33) | 11 |

---

## A. Trang học viên (máy tính + điện thoại)

| # | Trang | Vai trò | Vấn đề | Mức | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|---|---|
| 1 | /learning-paths/[id] (điện thoại) | Học viên | Thẻ khoá trong dòng thời gian vỡ: tên khoá còn 1 chữ “K”, dòng “Hoàn thành … để mở” chia 3 cột chữ, nút chiếm chỗ tên | Cao | `learning-paths/[id]/page.tsx:97-139` | Điện thoại xếp dọc (ảnh + chữ trên, nút `w-full` dưới); dòng chặn `items-start`; đầu trang `flex-col sm:flex-row`, `p-4 sm:p-6` | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| 2 | /notifications (điện thoại) | Mọi vai trò | Nút “Đánh dấu tất cả đã đọc” ép tiêu đề trang thành cột hẹp; thông báo dài hiện 1–2 chữ / dòng vì nút “Đánh dấu đã đọc” chiếm chỗ | Cao | `components/page-header.tsx:17`; `notifications/notification-list.tsx:48-55` | `PageHeader` `flex-col sm:flex-row`; trên điện thoại nút đánh dấu xuống dưới nội dung hoặc thành nút icon + tooltip | Đã sửa — nút từng dòng chỉ icon + Tooltip trên điện thoại (PageHeader đã có sẵn khi rà lại ở Việc 33) |
| 3 | /learn — bài kiểm tra (điện thoại) | Học viên | Bảng “Lịch sử làm bài” 6 cột trong khung `overflow-hidden`: ở 375px cột Kết quả + nút “Xem lại” bị cắt mất | Cao | `components/learning/quiz/quiz-intro.tsx:112-154` | Bọc `overflow-x-auto` hoặc dạng thẻ trên điện thoại | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| 4 | /learn — bài kiểm tra (điện thoại) | Học viên | Khung đồng hồ + lưới câu + nút Nộp nằm TRÊN câu hỏi (đề 30–50 câu phải cuộn qua lưới mỗi câu); ô số câu cao 36px | Trung bình | `quiz-player.tsx:265,301` | Điện thoại: đồng hồ gọn dính trên cùng, lưới câu vào Sheet “Danh sách câu”; ô `h-10` | Đã sửa — đã có sẵn khi rà lại ở Việc 33 (đồng hồ dính trên, ô h-10) |
| 5 | /dashboard (điện thoại) | Học viên | “Cần làm”: tên khoá bị cắt còn “Khoá 4: …” vì hạn + badge chiếm phần lớn chiều ngang; “Xem tất cả” xuống 2 dòng | Trung bình | `dashboard/page.tsx:81,100,106` | Điện thoại đưa hạn + badge xuống dưới tên; link `whitespace-nowrap shrink-0` | Đã sửa — đã có sẵn khi rà lại ở Việc 33 (hạn + badge xuống dưới tên) |
| 6 | /my-courses, /library | Học viên | `line-clamp-2` + `leading-snug`: dấu tiếng Việt của dòng thứ 3 lộ thành vệt chấm dưới tên khoá | Trung bình | `my-courses/course-card.tsx:80`; `library/library-card.tsx:55` | `leading-normal` hoặc `max-h` khớp đúng 2 dòng | Đã sửa — đã có sẵn khi rà lại ở Việc 33 (leading-normal) |
| 7 | /my-courses | Học viên | Không phân trang: 30 thẻ trên 1 trang (ảnh điện thoại dài 27.508px) | Trung bình | `my-courses/page.tsx:135`; `lib/learning.ts` (`getMyEnrollments`) | Phân trang 12 thẻ / trang qua searchParams | Đã sửa — đã có sẵn khi rà lại ở Việc 33 (12 thẻ / trang) |
| 8 | /my-courses/[id] (điện thoại) | Học viên | Mục lục: tên bài / chương bị cắt còn “Bài học…” do `pl-14` + badge “Bài tiếp theo” | Trung bình | `my-courses/[courseId]/page.tsx:222,235,284-296` | `px-4 pl-12 sm:px-6 sm:pl-14`, tên bài `line-clamp-2`, badge xuống dòng phụ | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| 9 | /library/[id] (điện thoại) | Học viên | Lưới 6 thông tin `grid-cols-3` + `truncate`: “Tập đoà…”, “Có — hiệ…” (mất thời hạn chứng nhận); `title` không xem được trên cảm ứng | Trung bình | `library/[courseId]/page.tsx:121,207` | `grid-cols-2 sm:grid-cols-3`, giá trị xuống dòng thay vì cắt | Đã sửa — grid-cols-2 sm:grid-cols-3, giá trị xuống dòng |
| 10 | /my-courses/[id]/updates | Học viên | “Bạn đang nắm phiên bản v0 → v1” ngay cạnh khung “Bạn đã nắm phiên bản mới nhất” (khoá chưa học xong) | Trung bình | `my-courses/[courseId]/updates/page.tsx:52-55,72` | Chỉ hiện “v… → v…” khi có bản chờ xác nhận | Đã sửa — F5: chỉ hiện v→v khi có bản chờ; chưa học → về trang khoá |
| 11 | /learn — video | Học viên | Lỗi YouTube 100/101/150 hiện câu cho quản trị (“Video phải để chế độ Không công khai và cho phép nhúng”) — học viên không biết làm gì | Trung bình | `video-player/youtube-player.tsx:39-41`; `learning/video-lesson.tsx:189-193` | Học viên: “Video tạm thời không phát được. Vui lòng báo quản trị đào tạo.”; câu kỹ thuật chỉ ở chế độ xem trước | Đã sửa — Học viên: “Video tạm thời không phát được…”; câu kỹ thuật chỉ ở xem trước |
| 12 | /learn — bài cuối | Học viên | Khi bài chưa xong, “Về trang khoá học” màu xám `secondary` cạnh “Bài trước” bị khoá → cả hai trông như bị khoá | Trung bình | `learning/lesson-shell.tsx:207` | `outline` | Đã sửa — outline |
| 13 | /dashboard | Học viên | Thẻ “Đang học” chỉ đếm khoá đã bắt đầu: có khoá được giao chưa học vẫn “Đang học 0” (xem Lỗi chức năng F4) | Trung bình | `lib/learning.ts:230`; `dashboard/page.tsx:47` | Đổi nhãn “Chưa hoàn thành” hoặc thêm thẻ “Chưa bắt đầu” (cần duyệt) | Đã sửa — F4: thêm thẻ “Chưa bắt đầu” (5 thẻ) |
| 14 | /my-courses/[id] (điện thoại) | Học viên | Lưới thông tin `grid-cols-3` cố định (icon + ngày tách dòng); tiêu đề 200 ký tự `text-2xl` dài 9 dòng | Thấp | `my-courses/[courseId]/page.tsx:105,112` | `grid-cols-2 sm:grid-cols-3`; h1 `text-xl sm:text-2xl` | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| 15 | /my-courses/[id]/updates (điện thoại) | Học viên | Icon 48px + `p-6` làm tiêu đề `text-2xl` dài 12 dòng | Thấp | `updates/page.tsx:44-51` | `p-4 sm:p-6`, h1 nhỏ hơn, ẩn icon dưới `sm` | Đã sửa — p-4 sm:p-6, ẩn icon dưới sm, h1 nhỏ hơn |
| 16 | /library/[id] | Học viên | Khoá đã hoàn thành vẫn ghi “… đăng ký để bắt đầu học”; nút “Xem lại khoá học” xám như bị khoá | Thấp | `library/[courseId]/page.tsx:66,160` | Chỉ hiện câu mời khi chưa có lượt học; `outline` | Đã sửa — Câu mời chỉ khi chưa có lượt học; nút outline |
| 17 | /learn (điện thoại) | Học viên | Tên bài trong thẻ điều hướng chỉ 1 dòng `truncate`, không có cách xem đủ tên | Thấp | `lesson-shell.tsx:177` | `line-clamp-2` trên điện thoại | Đã sửa — line-clamp-2 trên điện thoại + title |
| 18 | /learn — bài kiểm tra, /updates | Học viên | Nút “Nộp bài” ở cuối câu và “Tôi đã đọc và nắm được” chỉ quay vòng, không đổi chữ khi đang xử lý | Thấp | `quiz-player.tsx:256-259`; `updates/ack-button.tsx:41-42` | “Đang nộp...” / “Đang xác nhận...” | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| 19 | /learn — hoàn thành khoá | Học viên | Dialog chúc mừng cuộn cả khối → hàng nút trôi khỏi màn hình khi có form đánh giá | Thấp | `learning/course-completed-dialog.tsx:34` | Header–body–footer (mục 5.3), body cuộn | Đã sửa — Header – DialogBody cuộn – footer |
| 20 | /certificates (điện thoại) | Học viên | Nút “Tải PDF” / “Sao chép link tra cứu” cao ~30px (< 40px) | Thấp | `components/certificate-actions.tsx:13,37-46` | `h-10 sm:h-8` | Đã sửa — max-sm:h-10 |
| 21 | /certificates | Học viên | Badge “Hết hạn” màu xám; mục 5.4 quy định Hết hạn = đỏ | Thấp | `lib/certificate-status.ts:9` | `tone: "destructive"` | Đã sửa — tone destructive |
| 22 | /certificates | Học viên | Không phân trang (ảnh điện thoại dài 10.934px với người nhiều chứng nhận) | Thấp | `certificates/page.tsx:20` | Phân trang hoặc nhóm theo năm | Đã sửa — Phân trang 12 chứng nhận / trang |
| 23 | /my-courses, /library (điện thoại) | Học viên | Ô tìm kiếm cố định `w-64` lệch mép với ô chọn `w-full`; thanh tab bị cắt (“Chưa bắ”) không có dấu hiệu cuộn | Thấp | `data-table/data-table-search.tsx:33`; `my-courses/page.tsx:73` | `w-full sm:w-64`; mờ mép phải thanh tab | Đã sửa — w-full sm:w-64; mờ mép phải thanh tab |
| 24 | /change-password | Mọi vai trò | Không dùng `FormField` (lỗi chung 1 dòng, không gắn từng ô), gợi ý 12px; không có nút hiện mật khẩu như trang đăng nhập | Thấp | `change-password/change-password-form.tsx:16-41` | `FormField` + lỗi theo ô + nút ẩn / hiện | Đã sửa — FormField + lỗi theo ô + nút ẩn / hiện |
| 25 | /verify (điện thoại) | Công khai | Gợi ý ô nhập bị cắt (“VD: CERT-2026-AI”) vì nút Tra cứu chiếm chỗ | Thấp | `verify/verify-form.tsx:7` | `flex-col sm:flex-row` | Đã sửa — flex-col sm:flex-row |

## B. Nội dung & giao khoá (máy tính)

| # | Trang | Vai trò | Vấn đề | Mức | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|---|---|
| 26 | /content/courses/[id]?tab=content | GA, CA, CE | Tên chương / bài dài đẩy cả khung rộng ra: nút “Thêm bài”, menu ⋮, nút ẩn / xoá bài nằm ngoài vùng nhìn, phải cuộn ngang mới bấm được (lưới thiếu `min-w-0`) | Cao | `content/courses/[id]/page.tsx:210`; `content-editor.tsx:193,250` | `grid-cols-1` / `min-w-0` cho cột và `<section>` chương; tên `truncate` + `title` | Đã sửa — min-w-0 lưới soạn nội dung; tên truncate + title |
| 27 | /assign/manual | GA, CA | Bảng 12 cột rộng hơn 1440px: cột ⋮ (gia hạn / cấp lượt / huỷ giao), Hạn, Người giao bị khuất, không có dấu hiệu cuộn ngang | Cao | `assign/manual/page.tsx:133-235` | Gộp Công ty vào dòng phụ dưới Học viên, Lộ trình vào Cách giao; bỏ / gộp Người giao + Ngày giao; hoặc cột thao tác `sticky right-0` | Đã sửa — Gộp cột phụ thành dòng phụ; cột thao tác sticky |
| 28 | /assign/rules/[id] (quy tắc đang tắt) | GA, CA | Chữ “Lưu quy tắc sẽ giao ngay…” + xem trước “35 giao mới” trong khi server KHÔNG giao khi quy tắc tắt (xem F2) | Cao | `assign/rules/rule-form.tsx:238,246` | Khi tắt: “Quy tắc đang tắt — lưu chỉ cập nhật điều kiện”; xem trước ghi “Nếu bật lại…” | Đã sửa — F2: khung “Quy tắc đang tắt”, “Nếu bật lại: …”, nút Bật lại / Tắt quy tắc ở trang chi tiết |
| 29 | /content/courses | GA, CA, CE | Bảng tràn ngang ở 1440px: cột Đánh giá, Cập nhật bị khuất | Trung bình | `content/courses/page.tsx:96-167` | Cột Công ty chỉ cho GA; tên khoá `truncate` 240px; gộp / bỏ “Cập nhật” | Đã sửa — Cột Công ty chỉ GA; tên 240px; Cập nhật chỉ ngày |
| 30 | Tab Lịch sử phiên bản | Tất cả | Badge loại hiện mã tiếng Anh “INITIAL” | Trung bình | `content/courses/[id]/version-history.tsx:19` | “Lần đầu” | Đã sửa — “Lần đầu” |
| 31 | /content/courses/[id], /content/paths/[id], /content/questions/import | CE (khoá công ty khác) | Ngoài phạm vi → lặng lẽ về danh sách, không báo gì; khác /assign/rules/[id] dùng trang “Không tìm thấy” | Trung bình | `courses/[id]/page.tsx:57`; `paths/[id]/page.tsx:33`; `questions/import/page.tsx:20` | `notFound()` cho thống nhất | Đã sửa — notFound() + trang “Không tìm thấy khoá học / lộ trình” |
| 32 | Thanh trên trang soạn khoá | Tất cả | Tên 200 ký tự còn ~20 ký tự vì 3 nút bên phải chiếm chỗ cố định | Trung bình | `content/courses/[id]/course-header.tsx:64,76` | h1 `line-clamp-2 break-words`, nút xuống hàng khi thiếu chỗ | Đã sửa — h1 line-clamp-2; hàng nút xuống hàng khi thiếu chỗ |
| 33 | Tab Thông tin khoá | GA, CA, CE | Chuyển tab là mất thay đổi chưa lưu, không cảnh báo | Trung bình | `course-tabs.tsx:25`; `course-info-form.tsx:110` | Hỏi xác nhận khi rời tab / trang lúc có thay đổi | Đã sửa — F9: hỏi “Bỏ thay đổi chưa lưu?” + cảnh báo trình duyệt |
| 34 | Dialog bài học (tài liệu / video / bài kiểm tra) | GA, CA, CE | Esc hoặc bấm ra ngoài đóng ngay, mất nội dung đang soạn | Trung bình | `content/courses/[id]/lesson-dialog.tsx:62` | Tắt đóng khi bấm ngoài; hỏi xác nhận khi có thay đổi | Đã sửa — F9: Esc / bấm ngoài khi có thay đổi → hỏi xác nhận |
| 35 | /content/questions?course= (chỉ xem) | CA, CE | Thông báo “bạn chỉ được xem **và xuất** câu hỏi” nhưng không có nút Xuất (xem F3) | Trung bình | `content/questions/page.tsx:228,305` | Sửa chữ thành “chỉ được xem” (theo Việc 29B) | Đã sửa — F3: “chỉ được xem câu hỏi” |
| 36 | /assign/rules | GA, CA | Cột “Nhóm áp dụng” bị ép hẹp, xuống 3–4 dòng | Thấp | `assign/rules/page.tsx:150-152` | `min-w-56`, `line-clamp-2` + `title` | Đã sửa — min-w-56, line-clamp-2 + title |
| 37 | Tab Lịch sử phiên bản | Tất cả | Dải trống 24px phía trên bảng | Thấp | `version-history.tsx:92` | `-mt-6` | Đã sửa — Bảng sát mép trên (-m-6) |
| 38 | Dialog Phát hành | GA, CA, CE | “…{n} kiểm tra” (sai thuật ngữ); số đếm chưa qua `formatNumber` | Thấp | `content/courses/[id]/publish-dialog.tsx:182-183` | “bài kiểm tra”, `formatNumber` | Đã sửa — “bài kiểm tra”, formatNumber |
| 39 | Nút lưu form sửa / import | GA, CA, CE | “Lưu thông tin”, “Lưu quy tắc”, “Lưu bài học”; nút xác nhận import ghi “Import” | Thấp | `course-info-form.tsx:267`; `path-editor.tsx:521`; `rule-form.tsx:246`; `lesson-dialog.tsx:169`; `questions/import/import-wizard.tsx:264,274` | Form sửa “Lưu thay đổi”; import “Thêm {n} câu hỏi” | Đã sửa — “Lưu thay đổi”; import “Thêm {n} câu hỏi” / “Import {n} người” |
| 40 | /content/paths/[id] | GA, CA, CE | Nút X “Bỏ khỏi lộ trình” chạy ngay không hỏi lại; sắp xếp / bỏ khoá lỗi mạng không có toast (F8) | Thấp | `content/paths/[id]/path-editor.tsx:266-283,365` | `ConfirmDialog` + `try/catch` | Đã sửa — F8: ConfirmDialog + try/catch + toast |
| 41 | /assign/manual/new bước 1 | GA, CA | Thẻ khoá trong danh sách cuộn mất viền / góc bo bên phải | Thấp | `assign/manual/new/assign-wizard.tsx:261` | `p-px pr-1` cho `ul` | Đã sửa — p-px pr-1 |
| 42 | /content/categories | GA | Cột “Thứ tự” bắt đầu từ 0; mũi tên đổi thứ tự vẫn bấm được khi đang lọc | Thấp | `content/categories/page.tsx:77` | Hiện +1 hoặc bỏ cột; khoá mũi tên khi lọc | Đã sửa — Bỏ cột Thứ tự (số khoá từ 0); khoá mũi tên khi đang lọc |
| 43 | /content/questions | GA, CA, CE | Bộ lọc trạng thái thiếu “Chờ duyệt” dù badge có trạng thái này | Thấp | `content/questions/page.tsx:296-299` | Thêm tuỳ chọn | Đã sửa — Thêm “Chờ duyệt” (lọc khớp nhãn cột) |
| 44 | Dialog / xác nhận với tên dài | GA, CA, CE | Tiêu đề “Thêm bài vào “…200 ký tự…””, “Xoá hẳn chương “…”?” dài 3–4 dòng | Thấp | `content-dialogs.tsx:139`; `content-editor.tsx:321-379` | `line-clamp-2` hoặc cắt ~60 ký tự | Đã sửa — ConfirmDialog + dialog Thêm bài: line-clamp-2 + title |
| 45 | Tab trang soạn khoá | — | Focus bằng phím chỉ có nền mờ, không có vòng focus | Thấp | `content/courses/[id]/course-tabs.tsx:30` | `focus-visible:ring-3 ring-ring/50` | Đã sửa — focus-visible:ring-3 |
| 46 | Dialog Thêm bài | — | Thẻ loại bài `role="radio"` nhưng mỗi thẻ 1 điểm dừng Tab, phím mũi tên không đổi lựa chọn | Thấp | `content-dialogs.tsx:145-167` | Roving tabindex ← → | Đã sửa — Roving tabindex, ← → ↑ ↓ |
| 47 | Dialog bài học (chỉ xem) | CA, CE | Không có nút “Đóng” ở chân dialog | Thấp | `lesson-dialog.tsx:165` | Footer chỉ có “Đóng” | Đã sửa — Footer chỉ “Đóng” |
| 48 | /assign/manual | GA, CA | Ô tìm kiếm `w-64` cắt placeholder “Tìm học viên (tên, mã N” | Thấp | `assign/manual/page.tsx:339` | “Tên, mã NV...” | Đã sửa — “Tên, mã NV...” |

## C. Tổ chức, đội, báo cáo, hệ thống (máy tính)

| # | Trang | Vai trò | Vấn đề | Mức | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|---|---|
| 49 | /org/users/[id] | GA, CA | Ô “Khoá học” LUÔN hiện câu cũ “Chưa có khoá học… khi có chức năng giao khoá” với mọi người (xem F1) | Cao | `org/users/[id]/page.tsx:236-241` | Hiện lượt học thật (dùng lại bảng ở /team/members/[id]) + EmptyState đúng câu | Đã sửa — F1: bảng lượt học dùng chung (EnrollmentTable) |
| 50 | /org/users/[id] | GA, CA | Email dài + “CTY1 — Công ty Thành viên 1” tràn khỏi thẻ trái, đè khe giữa 2 cột (`dl` dạng lưới thiếu `min-w-0`) | Cao | `org/users/[id]/page.tsx:172,305` | `grid-cols-1 min-w-0` cho `dl`, ô `wrap-anywhere` hoặc `truncate` + `title` | Đã sửa — min-w-0 + wrap-anywhere |
| 51 | /org/users | GA, CA | Bảng 9 cột tràn ở 1440px: cột Thao tác (Sửa / Khoá / Đặt lại MK) ra ngoài màn hình | Cao | `org/users/page.tsx:146-200` | Gộp Phòng ban + Chức danh (2 dòng), `truncate`; hoặc cột thao tác `sticky right-0` | Đã sửa — Gộp cột (công ty / phòng ban – chức danh); cột thao tác sticky |
| 52 | /team/members | MG, GA | Cột Phòng ban / Chức danh không `truncate`: mỗi từ 1 dòng, dòng cao 100–230px (“Phòng ban cấp 5 — …” 10 dòng); cột Tỷ lệ bị cắt | Cao | `team/members/members-table.tsx:166,198-199` | `max-w-48 truncate` + `title`; `min-w` cột Tỷ lệ | Đã sửa — max-w-48 truncate + title; min-w cột Tỷ lệ |
| 53 | /reports (tab Khoá học, Chứng nhận) | GA, MG | Cột cuối (Tỷ lệ, sau “Ngày hết hạn”) bị cắt ở mép phải 1440px | Trung bình | `reports/report-tables.tsx:75,343` | Thu cột tên khoá; `min-w` cột tỷ lệ | Đã sửa — Tên khoá 224px, phòng / chức danh truncate, min-w cột Tỷ lệ |
| 54 | /system/overview | GA | Bảng so sánh công ty cắt cột “% học viên hoạt động 30 ngày” | Trung bình | `system/overview/page.tsx:108` | Tiêu đề ngắn + tooltip ⓘ | Đã sửa — Tiêu đề ngắn + ⓘ nhắc tên đầy đủ |
| 55 | /team | GA | Biểu đồ phòng ban cao theo số phòng (~60 thanh, trang 4.000px); tên trùng “Phòng 1” ×5 không kèm công ty | Trung bình | `team/team-charts.tsx:48`; `team/page.tsx:130` | Top 10–15 + “Xem tất cả”; thêm mã công ty khi xem cả tập đoàn | Đã sửa — 15 phòng nhiều lượt học nhất + “Xem tất cả”; kèm mã công ty khi xem cả tập đoàn |
| 56 | /team | GA, MG | Nhãn trục X biểu đồ khoá đè nhau (“TONG-K0TONG-K02…”) do `interval={0}` | Trung bình | `team/team-charts.tsx:22` | Xoay −30°, cắt ngắn | Đã sửa — Xoay −30°, cắt 12 ký tự |
| 57 | /system/jobs | GA | Mô tả trang là chữ kỹ thuật (“POST /api/jobs/daily… CRON_SECRET… npm run job:daily”) | Trung bình | `system/jobs/page.tsx:39` | Viết cho quản trị (“Hệ thống tự chạy mỗi ngày…”), phần kỹ thuật vào docs | Đã sửa — Mô tả cho quản trị; phần kỹ thuật ở docs |
| 58 | /system/certificate-templates | GA, CA | “Xem trước PDF” dùng mẫu ĐÃ LƯU, sửa xong bấm xem thấy bản cũ (chỉ ghi trong `title`) | Trung bình | `system/certificate-templates/template-form.tsx:119-122` | Khoá nút khi có thay đổi chưa lưu hoặc ghi “Xem trước mẫu đã lưu” | Đã sửa — F10: có thay đổi chưa lưu → khoá nút, ghi “Lưu mẫu để xem trước” |
| 59 | /system/jobs | GA | 9 tiêu đề cột xuống 4–6 dòng; thời gian chạy “2.129 ms” | Thấp | `system/jobs/page.tsx:52,95` | Tiêu đề ngắn + tooltip; đổi sang giây | Đã sửa — Tiêu đề ngắn 1 dòng + ⓘ; thời gian chạy theo giây |
| 60 | /reports (đội không có dữ liệu) | MG | Không lọc gì vẫn báo “Chưa có lượt học nào **khớp bộ lọc**” | Thấp | `reports/report-tables.tsx:104` | Phân biệt có lọc / không lọc | Đã sửa — Phân biệt có / không lọc |
| 61 | /team/members, /team | MG | “Chưa nắm cập nhật” (cột) khác “Chưa nắm quy trình mới” (thẻ); nút “Nhắc nhở” là danh từ | Thấp | `members-table.tsx:37,132`; `team/members/export/route.ts:31` | Thống nhất cụm từ; nút “Gửi nhắc nhở” | Đã sửa — “Chưa nắm quy trình mới”; nút “Gửi nhắc nhở” |
| 62 | /reports tab Người | GA, MG | Viết tắt “CN còn hạn”, “Số NV”; “Xong” khác “Hoàn thành” ở tab khác; “Điểm TB” lẫn “87” và “91,5” | Thấp | `reports/report-tables.tsx:22,244,252` | “Chứng nhận còn hạn”, “Hoàn thành”; `formatDecimal(v, 1, true)` | Đã sửa — “Chứng nhận còn hạn”, “Hoàn thành”, “Số nhân viên”; điểm 1 chữ số thập phân |
| 63 | /team, /system/overview | GA, MG | “lượt khoá được giao”, “lượt được giao” lệch mục 9.3 | Thấp | `team/page.tsx:90`; `system/overview/page.tsx:129` | “lượt học” | Đã sửa — “lượt học” |
| 64 | /org/users, /org/users/[id] | GA, CA | Nút “Import Excel” (nên “Import nhân viên”); nút “Sửa” thiếu đối tượng, hàng nút xuống dòng lẻ “Khoá” | Thấp | `org/users/page.tsx:315`; `org/users/user-actions.tsx:154-168` | Đổi chữ; xếp nút gọn | Đã sửa — “Import nhân viên”, “Sửa thông tin”, “Khoá tài khoản”; nút xếp dọc |
| 65 | /team, /team/members/[id] | MG | Trạng thái rỗng là chữ trơn (“Chưa có số liệu.”, “Chưa có chứng nhận.”), chưa dùng `EmptyState`; phiên bản hiện “v0 / v1” khi chưa học | Thấp | `team/page.tsx:119,128`; `team/members/[id]/page.tsx:135,185,216` | `EmptyState size="sm"`; “Chưa học / v1” | Đã sửa — EmptyState size=sm; “Chưa học / vN” (EnrollmentTable) |
| 66 | /org/departments | CA | Tên phòng dài + tên trưởng phòng xuống 2–3 dòng, dòng cao không đều (XL1–XL5) | Thấp | `org/departments/department-tree.tsx:189` | `truncate` + `title`, `max-w` cột trưởng phòng | Đã sửa — truncate + title, max-w trưởng phòng |
| 67 | /system/overview | GA | Menu + tiêu đề dùng tiếng Anh “Dashboard tập đoàn” | Thấp | `lib/roles.ts:98`; `system/overview/page.tsx:23,121` | “Tổng quan tập đoàn” | Đã sửa — “Tổng quan tập đoàn” |

## D. Thành phần chung

| # | Trang | Vai trò | Vấn đề | Mức | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|---|---|
| 68 | Header (mọi trang) | Mọi vai trò | Badge “99+” che gần hết icon chuông | Trung bình | `components/notification-bell.tsx:125` | Dời lên góc (`-top-1 -right-1`), chữ nhỏ hơn | Đã sửa — -top-1 -right-1, chữ 10px |
| 69 | /notifications, /change-password | Mọi vai trò | Breadcrumb trên header trống (trang ngoài MENU) | Trung bình | `components/header-breadcrumb.tsx:10` | Bảng tên cho trang ngoài menu | Đã sửa — Nhãn cho trang ngoài menu (Thông báo, Đổi mật khẩu) |
| 70 | Ô ngày (/reports, /system/audit-logs, bước Đặt hạn khi giao khoá) | GA, CA, MG | `<input type="date">` gốc hiện theo ngôn ngữ trình duyệt (mm/dd/yyyy trên trình duyệt tiếng Anh); nhãn “Từ / Đến ngày” chỉ `sr-only` | Trung bình | `data-table/date-range-filter.tsx:24-45`; `assign-wizard.tsx:407-415` | Date picker riêng hiện dd/MM/yyyy (Popover + lịch); nhãn nhìn thấy được | Đã sửa — DatePicker (src/components/date-picker.tsx): dd/MM/yyyy, lịch tiếng Việt, nhãn “Từ / Đến” — báo cáo, nhật ký, đặt hạn, gia hạn, ngày vào làm |
| 71 | Ô chọn file (import nhân viên, import câu hỏi) | GA, CA, CE | Ô file gốc hiện tiếng Anh “Choose File / No file chosen” | Trung bình | `org/users/import/import-wizard.tsx:254-262`; `content/questions/import/import-wizard.tsx:192-199` | Ẩn input, nút “Chọn file” + tên file / “Chưa chọn file” (như ô logo ở Cài đặt) | Đã sửa — FilePicker (src/components/file-picker.tsx) |
| 72 | Nút `secondary` (nhiều trang) | Tất cả | Nền xám trông như bị khoá: “Ngân hàng câu hỏi (0 câu)”, “Xuất Excel”, “Import Excel”, “Thêm khoá vào cuối”, “Đánh dấu tất cả đã đọc”… | Trung bình | `course-header.tsx:77`; `questions/page.tsx:309,315`; `path-editor.tsx:448,468`; `notification-list.tsx:71` | `outline` hoặc `soft-primary` (variant mới) | Đã sửa — outline (giữ secondary cho nút bật / tắt và nút đè trên ảnh) |
| 73 | loading.tsx một số trang con | — | Khung tải khác trang thật: soạn khoá 4 tab (thật 5), giao khoá 3 bước (thật 4), import / lộ trình [id] / dashboard dùng tiêu đề chữ cố định khác trang thật → nhảy bố cục | Thấp | `content/courses/[id]/loading.tsx:18`; `assign/manual/new/loading.tsx`; `content/questions/import/loading.tsx`; `content/paths/[id]/loading.tsx`; `dashboard/loading.tsx`; `learning-paths/[id]/loading.tsx` | Sửa cho khớp; tiêu đề động dùng Skeleton | Đã sửa — Khớp số tab / bước; tiêu đề động dùng Skeleton |

Các mục Thấp chung còn lại (gộp, mỗi dòng tính 1 mục):

| # | Vấn đề | Mức | File | Đề xuất | Trạng thái |
|---|---|---|---|---|---|
| — | Trang con: breadcrumb dừng ở mục menu; tiêu đề tab cố định (“Soạn khoá học”, “Học bài”, “Chi tiết người dùng”) không kèm tên khoá / người | Thấp | `header-breadcrumb.tsx`; các `page.tsx` động | Cấp 3 trong breadcrumb + `generateMetadata` (đã lọc phạm vi) | Đã sửa — Breadcrumb cấp 3 + generateMetadata (tên lấy từ truy vấn đã lọc phạm vi) |
| — | Phân trang: nút 38px cố định, số 4 chữ số lấp kín nút; số trang chưa `formatNumber`; bảng rỗng vẫn hiện “Hiển thị 0–0 trong 0 kết quả” | Thấp | `data-table/data-table-pagination.tsx:21,45` | `min-w-[38px] px-2`, `formatNumber`, ẩn khi total = 0 | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| — | Số / % ghép tay thay vì `formatPercent` / `formatNumber` (dashboard, course-card, lộ trình, lesson-shell, video-lesson, members-table, team/members/[id], assign/manual, overview-charts “49.9%”, company / position row-actions) | Thấp | nhiều file (danh sách ở báo cáo agent, mục 9.5) | Thay bằng hàm `format.ts` | Đã sửa — formatPercent ở biểu đồ, bảng nhân viên, thẻ tổng quan đội |
| — | Link tên trong bảng (VD /org/users) khi Tab chỉ đổi màu chữ (`focus-visible:outline-none`), không có vòng focus | Thấp | `org/users/page.tsx:117`; các link bảng tương tự | Bỏ `focus-visible:outline-none` để dùng vòng focus chung (`globals.css`) | Đã sửa — đã có sẵn khi rà lại ở Việc 33 |
| — | Trang “Không tìm thấy” trong (app) trả HTTP 200 (đã stream `loading.tsx` trước `notFound()`), câu chung chung, nút về Tổng quan | Thấp | `assign/rules/[id]/page.tsx:38`; `(app)/not-found.tsx` | Chấp nhận được với ứng dụng nội bộ; có thể ghi rõ “Không tìm thấy quy tắc” + nút về danh sách | Đã sửa — not-found.tsx riêng: “Không tìm thấy quy tắc / khoá học / lộ trình” + nút về danh sách |

> Đếm: Cao 10 (#1–3, 26–28, 49–52) · Trung bình 28 · Thấp 40 (35 mục đánh số + 5 dòng gộp ở trên).

---

## Lỗi chức năng phát hiện (đã sửa ở Việc 33)

| # | Mô tả | File | Ghi chú |
|---|---|---|---|
| F1 | /org/users/[id] không truy vấn lượt học: ô “Khoá học” là khối rỗng viết cứng → Admin hiểu sai “người này chưa được giao khoá” | `org/users/[id]/page.tsx:236-241` | Thiếu chức năng (UI #49) — **Đã sửa: `src/lib/member-detail.ts` + `EnrollmentTable` dùng chung với /team/members/[id]** |
| F2 | Quy tắc giao tự động đang TẮT: xem trước vẫn đếm “giao mới” và chữ hứa “giao ngay”, nhưng `saveRuleAction` bỏ qua `runRule` khi tắt; trang chi tiết không có nút bật lại (chỉ menu ⋮ ở danh sách) | `assign/rules/actions.ts:361`; `rule-form.tsx` | UI #28 sửa chữ; bật lại ở trang chi tiết cần quyết định — **Đã sửa: chữ khi tắt + nút Bật lại / Tắt quy tắc ở trang chi tiết** |
| F3 | Ngân hàng câu hỏi chỉ xem: thông báo hứa “xuất” nhưng không có nút Xuất. Việc 29B #1 chốt người chỉ xem KHÔNG được xuất → chỉ cần sửa chữ | `content/questions/page.tsx:228,305` | UI #35 — **Đã sửa chữ** |
| F4 | Thẻ “Đang học” (`getMyStats`) chỉ đếm `IN_PROGRESS`; khoá được giao chưa bắt đầu không được đếm ở thẻ nào | `lib/learning.ts:230` | Cần chốt định nghĩa chỉ số (UI #13) — **Đã sửa: thẻ “Chưa bắt đầu” → /my-courses?tab=notStarted** |
| F5 | Trang “Có gì thay đổi” mở được với khoá chưa học xong, hiện “đang nắm v0 → v1” | `my-courses/[courseId]/updates/page.tsx:53` | UI #10 — **Đã sửa** |
| F6 | Nội dung thông báo “Khoá {tên} đã quá hạn…” lặp chữ khi tên khoá bắt đầu bằng “Khoá” (“Khoá Khoá 4: …”) | `lib/jobs/daily.ts` (mẫu tiêu đề) | Đổi mẫu: đặt tên trong ngoặc “…”, đã có ở một số mẫu — **Đã sửa: tên khoá / lộ trình trong “…” ở mọi thông báo** |
| F7 | Mở link bài đang bị khoá (từ thông báo / dấu trang) → chuyển về trang khoá không báo lý do | `(learn)/learn/[courseId]/[lessonId]/page.tsx` | Thêm banner “Bài này chưa mở” — **Đã sửa: ?locked=1 → banner “Bài này chưa mở”** |
| F8 | `reorderCoursesAction` / `removeCourseAction` ở soạn lộ trình không `try/catch`: server lỗi thì thứ tự không trả lại, không toast | `content/paths/[id]/path-editor.tsx:266-283` | UI #40 — **Đã sửa** |
| F9 | Tab Thông tin khoá + dialog bài học: chuyển tab / Esc mất thay đổi chưa lưu | `course-tabs.tsx`, `lesson-dialog.tsx` | UI #33, #34 — **Đã sửa: UnsavedChangesDialog + beforeunload** |
| F10 | “Xem trước PDF” mẫu chứng nhận dùng mẫu đã lưu, không phải đang sửa | `template-form.tsx:119` | UI #58 — **Đã sửa** |
| F11 | `course-header.tsx:50` còn chữ “…có ở Việc 21” (mã việc nội bộ) — nhánh hiện không chạy tới | `content/courses/[id]/course-header.tsx:50` | Xoá chữ — **Đã sửa chữ** |

Không phải lỗi: cột “Đối tượng” ở Nhật ký hiện “—” với dữ liệu `elearning_perf` vì seed đo hiệu năng tạo `entityId` ngẫu nhiên;
với thao tác thật (kịch bản e2e 10) cột này hiện đúng tên đối tượng.
