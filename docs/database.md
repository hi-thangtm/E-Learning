# Thiết kế database — E-Learning Tập đoàn (v4 · 21 bảng)

Nguồn sự thật: `prisma/schema.prisma`. File này là quy tắc nghiệp vụ mà code PHẢI tuân theo.
Đặc tả chức năng: `docs/feature-spec.md`.

PostgreSQL 17 · Prisma 6 · tên bảng `snake_case` (`@@map`), cột `camelCase` · khoá chính `cuid()`.

## 7 nhóm bảng

| Nhóm | Bảng |
|---|---|
| 1. Tổ chức | companies (cây: tổng → con, có mẫu chứng nhận), departments (cây, có trưởng phòng), positions |
| 2. Người dùng | users |
| 3. Nội dung | course_categories, courses, course_versions, course_sections, lessons, learning_paths, learning_path_courses |
| 4. Kiểm tra | questions (ngân hàng câu hỏi theo khoá), quiz_attempts |
| 5. Giao khoá & tiến độ | assignment_rules, enrollments, lesson_progress |
| 6. Kết quả & phản hồi | certificates, course_reviews |
| 7. Hệ thống | notifications, audit_logs, system_settings |

## Thay đổi v4 so với v3

| # | Thay đổi | Lý do (theo đặc tả chức năng) |
|---|---|---|
| 1 | `departments.managerId` | Admin "chỉ định trưởng phòng"; phạm vi xem của Quản lý dựa vào đây |
| 2 | `departments`: mã duy nhất **trong từng công ty** (`@@unique([companyId, code])`) | Nhiều công ty con cùng có phòng "KT", "KD" |
| 3 | `questions` thuộc **khoá học** (không thuộc bài) + `topic`, `imageUrl` | Ngân hàng câu hỏi dùng chung cho mọi bài kiểm tra của khoá, lọc theo chủ đề |
| 4 | `lessons.questionTopic`, `lessons.showAnswers` | Bài kiểm tra chọn nguồn câu hỏi theo chủ đề; cấu hình cho xem đáp án |
| 5 | `course_versions.status` (PROPOSED / PUBLISHED / REJECTED), `proposedById`, `reviewNote` | Biên soạn chỉ được đề xuất bản MAJOR, Admin duyệt |
| 6 | `companies`: logo + người ký + ảnh chữ ký; bảng `system_settings` | Mẫu chứng nhận theo công ty; cài đặt chung của Admin tập đoàn |
| 7 | `users.passwordHash` bắt buộc | Phase 1 tài khoản do admin tạo, luôn có mật khẩu ban đầu |

## Quy tắc 1 — Phạm vi quyền (quản trị 2 cấp)

- Công ty tổng = `companies.parentId IS NULL`.
- `GROUP_ADMIN` (thuộc công ty tổng): thấy và sửa mọi thứ.
- `COMPANY_ADMIN`, `CONTENT_EDITOR`: chỉ dữ liệu có `ownerCompanyId = user.companyId`, và chỉ nhân viên có `companyId = user.companyId`. `COMPANY_ADMIN` không được gán vai trò `GROUP_ADMIN`.
- `MANAGER`: chỉ nhân viên thuộc các phòng có `departments.managerId = user.id` **và mọi phòng con** của chúng. Chỉ xem và nhắc nhở, không giao khoá.
- Khoá học / lộ trình một công ty con **thấy được** = của công ty tổng (PUBLISHED) + của chính công ty đó.
- Quy tắc giao do công ty con tạo: `targetCompanyId` bắt buộc = chính công ty đó.
- Mọi kiểm tra quyền làm ở server (không tin dữ liệu từ trình duyệt).

## Quy tắc 2 — Phiên bản quy trình

- `courses.currentVersion`: 0 = chưa phát hành. Phát hành lần đầu → 1 (`INITIAL`).
- Phát hành = dòng `course_versions` có `status = PUBLISHED`, `versionNo = currentVersion + 1`, `publishedAt`, `publishedById` + tăng `courses.currentVersion` — trong 1 transaction.
- **Đề xuất MAJOR** (Biên soạn): tạo dòng `status = PROPOSED`, `versionNo = NULL`, `proposedById`, `proposedAt`. Admin **duyệt** → chuyển thành PUBLISHED như trên; **từ chối** → `REJECTED` + `reviewNote`. Mỗi khoá chỉ có tối đa 1 đề xuất PROPOSED cùng lúc.
- `INITIAL` và `MINOR`: Biên soạn tự phát hành. `MAJOR`: chỉ `COMPANY_ADMIN` / `GROUP_ADMIN` phát hành.
- **MAJOR**: mọi enrollment `COMPLETED` của khoá → `status = NOT_STARTED`, `progressPercent = 0`, xoá trạng thái `lesson_progress` của các bài trong khoá, `dueDate = now + dueInDays`, gửi thông báo `VERSION_MAJOR`. Lịch sử cũ (quiz_attempts, certificates) giữ nguyên vì có cột `courseVersion`.
- **MINOR**: không đặt lại gì. Người có `acknowledgedVersion < currentVersion` thấy banner "Có cập nhật", đọc `changeSummary`, bấm xác nhận → `acknowledgedVersion = currentVersion`, `acknowledgedAt = now`.
- Hoàn thành khoá → `completedVersion = acknowledgedVersion = currentVersion`.
- "Đã nắm quy trình mới nhất" = `acknowledgedVersion = courses.currentVersion`.
- Nội dung chương/bài sửa trực tiếp (không lưu bản nháp riêng); phát hành phiên bản là sự kiện báo cho người học và quyết định học lại hay chỉ xác nhận.

## Quy tắc 3 — Giao khoá

- Mỗi người – mỗi khoá 1 enrollment (`@@unique([userId, courseId])`). Giao trùng → giữ dòng cũ, chỉ rút ngắn hạn nếu hạn mới sớm hơn. Enrollment `CANCELLED` được giao lại thì kích hoạt lại.
- Quy tắc bắt buộc chạy khi: tạo/sửa quy tắc; tạo nhân viên (thủ công / import); đổi phòng ban, chức danh hoặc công ty của nhân viên.
- Giao lộ trình = tạo enrollment cho từng khoá trong lộ trình, ghi `learningPathId`. Khoá sau chỉ mở khi khoá trước COMPLETED.

## Quy tắc 4 — Học và kiểm tra

- Học tuần tự theo chương (`course_sections.sortOrder`) rồi bài (`lessons.sortOrder`).
- VIDEO xong khi `maxWatchedSeconds ≥ durationSeconds × minWatchPercent / 100`. Vị trí nhảy quá `maxWatchedSeconds + 15` giây là tua → không tăng `maxWatchedSeconds`.
- DOCUMENT xong khi người học bấm "Đã đọc xong".
- QUIZ: rút ngẫu nhiên `questionCount` câu từ `questions` của **cùng khoá** với điều kiện `isActive AND isApproved` (và `topic = lessons.questionTopic` nếu có). Số lần làm tính trong phiên bản hiện tại (`courseVersion`), tối đa `maxAttempts`. Xong khi có 1 lần `passed = true`. Hết giờ → chấm câu đã chọn và tự nộp. Chỉ trả đáp án đúng về trình duyệt khi `showAnswers = true` và đã nộp.
- `progressPercent` = bài xong ÷ tổng bài × 100, tính lại mỗi khi một bài xong.

## Quy tắc 5 — Tài khoản

- Admin tạo tài khoản (thủ công / import Excel): đặt mật khẩu ban đầu, `mustChangePassword = true` → chạy quy tắc bắt buộc.
- `employeeCode` duy nhất toàn tập đoàn (là tên đăng nhập). Nếu các công ty con trùng mã, thêm tiền tố mã công ty (VD: `CTYA-00123`).
- Sai mật khẩu 5 lần → `lockedUntil = now + 15 phút`. Đăng nhập đúng → `failedLoginCount = 0`.
- Nghỉ việc → `status = INACTIVE` (không xoá). Đặt lại mật khẩu → `mustChangePassword = true`.
- Các cột `lark*` để trống ở phase 1 (dành cho đồng bộ Lark giai đoạn 2).

## Quy tắc 6 — Khác

- Không xoá dữ liệu nghiệp vụ: dùng `INACTIVE`, `ARCHIVED`, `CANCELLED`, `isActive = false`.
- Ghi nhiều bảng cùng lúc → `prisma.$transaction`.
- Quá hạn = `dueDate < now() AND status NOT IN (COMPLETED, CANCELLED)` — tính khi truy vấn, không lưu.
- Chứng nhận có `expiresAt` hết hạn → tác vụ hằng ngày đặt lại enrollment như bản MAJOR.
- Mẫu chứng nhận: lấy logo / người ký của công ty người học; cột nào trống thì lấy của công ty tổng.
- Mọi thao tác quản trị ghi `audit_logs`.

## Thay đổi database

```bash
npx prisma migrate dev --name mo_ta_thay_doi
```

Chạy trên máy dev (Postgres trong Docker). Commit `prisma/schema.prisma` + `prisma/migrations/`. Không sửa tay migration đã có. Server chạy `prisma migrate deploy` (container `migrate`).
