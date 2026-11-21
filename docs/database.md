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

### Phòng ban
- Mã phòng ban duy nhất **trong từng công ty**. Phòng cha và trưởng phòng phải **cùng công ty** với phòng ban.
- Không được chọn phòng cha là chính nó hoặc phòng con / cháu của nó (chống vòng lặp). Phòng cha mới phải đang dùng.
- Chỉ định trưởng phòng: người được chọn phải đang làm (`status = ACTIVE`); nếu đang là `LEARNER` → **tự nâng lên `MANAGER`**
  (ghi `DEPARTMENT_MANAGER_ASSIGNED` kèm `roleChange`). Gỡ trưởng phòng → **không** tự hạ vai trò.
- Chỉ **ẩn** được phòng khi không còn phòng con đang dùng (`isActive`) và không còn nhân viên đang làm (`status = ACTIVE`).
  **Hiện lại** phòng cần phòng cha (nếu có) đang dùng.

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

### Xoá / ẩn chương và bài (`course_sections.isArchived`, `lessons.isArchived`)
- Khoá **chưa phát hành** (`currentVersion = 0`, chưa ai học): xoá chương / bài là **xoá hẳn** (xoá chương xoá luôn mọi bài trong chương
  và file PDF đính kèm; `lesson_progress`, `quiz_attempts` xoá theo do `onDelete: Cascade` — khi đó chưa có dữ liệu học).
- Khoá **đã phát hành** (`currentVersion > 0`): **không xoá**, chỉ **ẩn** (`isArchived = true`): học viên không thấy, bài **không tính vào
  tiến độ / tổng số bài**, giữ nguyên `lesson_progress`, `quiz_attempts`, chứng nhận. Chương bị ẩn = mọi bài trong chương coi như ẩn. Hiện lại được.
- Sửa nội dung khoá đã phát hành có hiệu lực ngay; muốn báo cho người học thì phát hành phiên bản mới (Quy tắc 2).
- Nội dung bài Tài liệu (HTML) **luôn lọc ở server** bằng `sanitizeLessonHtml` (`src/lib/sanitize.ts`) trước khi lưu: chỉ giữ
  `p br h2 h3 strong em u ul ol li a`, link chỉ http/https (tự thêm `target="_blank" rel="noopener noreferrer"`). Bài Tài liệu phải có nội dung HOẶC file PDF.
- Thứ tự: `sortOrder` của chương trong khoá và của bài trong chương, lưu cả bố cục trong 1 transaction (kéo thả).

## Quy tắc 3 — Giao khoá

Lõi dùng chung: `assignCourse` / `previewAssignment` / `onUserOrgChanged` trong `src/lib/assignment.ts`.

- Mỗi người – mỗi khoá 1 enrollment (`@@unique([userId, courseId])`). Khi giao:
  - chưa có → tạo `NOT_STARTED`;
  - đã có, `NOT_STARTED` / `IN_PROGRESS` → giữ nguyên, **chỉ rút ngắn hạn** nếu hạn mới sớm hơn;
  - đã có, `COMPLETED` → bỏ qua;
  - đã có, `CANCELLED` → **kích hoạt lại**: `NOT_STARTED`, hạn mới, `source` / `assignedById` / `assignmentRuleId` mới.
- Chỉ giao khoá `PUBLISHED`. Bỏ qua người `INACTIVE` hoặc thuộc công ty tạm ngưng (đếm “bỏ qua”).
- Phạm vi: khoá của **công ty tổng** giao được cho mọi công ty; khoá của **công ty con** chỉ giao cho người công ty đó.
  Admin công ty chỉ giao cho / xem lượt giao của người công ty mình.
- Hạn (`dueDate`) = **23:59:59 giờ Việt Nam** của ngày hạn (“sau N ngày” = hôm nay + N). Quá hạn tính khi truy vấn (Quy tắc 6).
- Người được giao mới / kích hoạt lại nhận thông báo `COURSE_ASSIGNED` (“Bạn được giao khoá học: …”, link `/my-courses`).
- Ghi theo lô 500 người / transaction. Nhật ký `ENROLLMENTS_ASSIGNED`: 1 dòng cho mỗi công ty của người học (số giao mới / rút ngắn / kích hoạt lại);
  `actorId` NULL = Hệ thống tự giao. Không ghi khi không có thay đổi.
- **Huỷ giao** → `CANCELLED` (giữ tiến độ). Lượt `RULE` mà quy tắc còn chạy thì **không huỷ được** — phải tắt quy tắc.
- **Quy tắc giao tự động** (`assignment_rules`): điều kiện kết hợp kiểu VÀ (công ty / phòng ban + “gồm phòng con” / chức danh; trống = không lọc).
  - Quy tắc do công ty con tạo: `ownerCompanyId` = `targetCompanyId` = chính công ty đó. Admin tập đoàn: 1 công ty hoặc toàn tập đoàn (`targetCompanyId` NULL).
  - Khoá của quy tắc **cố định** sau khi tạo.
  - Tạo / bật lại / sửa (khi đang chạy) → giao ngay cho mọi người đang khớp (`source = RULE`, `assignmentRuleId`, hạn = hôm nay + `dueInDays`).
  - **Thu hẹp nhóm không thu hồi** lượt đã giao; chỉ áp dụng thêm cho người mới khớp. Người chuyển RA khỏi nhóm: giữ nguyên lượt đã giao.
  - **Tắt** quy tắc: chọn “Giữ các lượt đã giao” (mặc định) hoặc “Huỷ các lượt CHƯA BẮT ĐẦU của quy tắc này”. Lượt đang học / đã xong luôn giữ.
  - Khoá không còn `PUBLISHED` (VD lưu trữ) → quy tắc **tự bỏ qua**, không giao cho ai (bảng quy tắc có cảnh báo).
- **Người vào sau** — `onUserOrgChanged(userId)` chạy khi: tạo người dùng, import Excel, đổi phòng ban / chức danh / công ty, **mở khoá tài khoản**.
  Tìm mọi quy tắc đang chạy khớp công ty / chức danh / phòng ban (quy tắc “gồm phòng con” đặt ở **phòng cha / ông** cũng khớp) → giao.
- Giao lộ trình = tạo enrollment cho từng khoá trong lộ trình, ghi `learningPathId`. Khoá sau chỉ mở khi khoá trước COMPLETED (làm ở việc Lộ trình).

## Quy tắc 4 — Học và kiểm tra

- Học tuần tự theo chương (`course_sections.sortOrder`) rồi bài (`lessons.sortOrder`).
- **Nguồn video** (`lessons.videoProvider`, `videoId`, `videoStatus`, `durationSeconds`) — **không lưu file video trên server**:
  - `YOUTUBE`: chỉ lưu mã 11 ký tự (server tự tách từ link). Video phải để **Không công khai** và cho phép nhúng — **ai có link đều xem được**,
    không dùng cho quy trình nội bộ cần bảo mật. Phát qua `www.youtube-nocookie.com`. Thời lượng đo bằng trình phát lúc gắn; `videoStatus = READY` ngay.
  - `BUNNY`: trình duyệt tải **thẳng** lên Bunny Stream bằng TUS (server chỉ tạo video + ký chữ ký 1 giờ, API key không rời server).
    Tải xong → `PROCESSING`; hỏi Bunny mỗi 10 giây → `READY` (lưu `durationSeconds`) hoặc `FAILED`. Phát bằng iframe kèm **token hết hạn sau 6 giờ**,
    tạo ở server mỗi lần mở bài. Cần đủ `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_TOKEN_KEY`.
  - Thay video / đổi nguồn / gỡ video / **xoá hẳn** bài: xoá video cũ trên Bunny (lỗi chỉ ghi log, không chặn). **Ẩn** bài: giữ video.
  - Bài chỉ tính được hoàn thành khi `videoStatus = READY` và có `durationSeconds`.
- VIDEO xong khi `maxWatchedSeconds ≥ durationSeconds × minWatchPercent / 100`. Vị trí nhảy quá `maxWatchedSeconds + 15` giây là tua → không tăng `maxWatchedSeconds`.
  - Tiến độ video gửi về `POST /api/learn/progress` (mỗi 10 giây khi phát, khi tạm dừng / hết video, `sendBeacon` lúc rời trang) →
    `recordVideoProgress` (`src/lib/learning.ts`). **Chống gửi số giả:** `maxWatchedSeconds` chỉ tăng tối đa
    (thời gian thực từ `lesson_progress.updatedAt`) × 2 + 5 giây; luôn ghi `lastPositionSeconds`. Trình duyệt kéo về khi tua vượt; bài đã xong tua tự do.
- **Mở bài = bắt đầu học** (`startLearning`): lượt học `NOT_STARTED → IN_PROGRESS` + `startedAt`; bài VIDEO / DOCUMENT chưa xong
  được tạo / chạm `lesson_progress` (`updatedAt` = lúc mở — mốc cho chống gửi số giả và 15 giây của tài liệu). Mọi kiểm tra quyền học bài
  dùng `getLessonAccess`: lượt học khác CANCELLED + bài chưa ẩn thuộc khoá + không bị khoá tuần tự. Không ghi `audit_logs` cho tiến độ học.
- DOCUMENT xong khi người học bấm "Đã đọc xong" — chỉ nhận khi bài đã mở ≥ 15 giây (server kiểm tra theo `lesson_progress.updatedAt`).
- **Hoàn thành bài / khoá** — `completeLesson` (1 transaction, dùng chung cho video, tài liệu, bài kiểm tra): đánh dấu bài xong (đã xong thì giữ),
  tính lại `progressPercent`; đủ 100% → `COMPLETED`, `completedAt`, `completedVersion = acknowledgedVersion = currentVersion`, `acknowledgedAt`,
  gọi `onCourseCompleted` (Việc 22 cấp chứng nhận, Việc 23 mở khoá tiếp theo trong lộ trình). Lượt đã COMPLETED không bị hạ trạng thái khi xem lại.
- **Xem file** (`/api/files/...`, `src/lib/file-access.ts`): file khoá học (`courses/...`: ảnh bìa, PDF bài học) chỉ trả cho người có lượt học
  khoá đó (khác CANCELLED) hoặc GROUP_ADMIN / COMPANY_ADMIN / CONTENT_EDITOR thấy được khoá theo phạm vi (Quy tắc 1); sai → 403.
  File không gắn khoá nào → 404. File khác: chỉ cần đăng nhập.
- QUIZ: rút ngẫu nhiên `questionCount` câu từ `questions` của **cùng khoá** với điều kiện `isActive AND isApproved` (và `topic = lessons.questionTopic` nếu có). Số lần làm tính trong phiên bản hiện tại (`courseVersion`), tối đa `maxAttempts`. Xong khi có 1 lần `passed = true`. Hết giờ → chấm câu đã chọn và tự nộp. Chỉ trả đáp án đúng về trình duyệt khi `showAnswers = true` và đã nộp.
- `progressPercent` = bài xong ÷ tổng bài × 100, tính lại mỗi khi một bài xong.

## Quy tắc 5 — Tài khoản

- Admin tạo tài khoản (thủ công / import Excel): đặt mật khẩu ban đầu, `mustChangePassword = true` → chạy quy tắc bắt buộc.
- `employeeCode` duy nhất toàn tập đoàn (là tên đăng nhập). Nếu các công ty con trùng mã, thêm tiền tố mã công ty (VD: `CTYA-00123`).
- Sai mật khẩu 5 lần → `lockedUntil = now + 15 phút`. Đăng nhập đúng → `failedLoginCount = 0`.
- Nghỉ việc → `status = INACTIVE` (không xoá). Đặt lại mật khẩu → `mustChangePassword = true`.
- **Công ty tạm ngưng** (`companies.isActive = false`) → mọi nhân viên của công ty đó **không đăng nhập được**
  (thông báo "Công ty của bạn đang tạm ngưng sử dụng hệ thống"); phiên đang mở mất hiệu lực ở request kế tiếp
  (`getCurrentUser` trả `null`). Dữ liệu giữ nguyên; kích hoạt lại thì đăng nhập bình thường.
- Công ty chỉ có 2 cấp: công ty con luôn có `parentId` = công ty tổng. Công ty tổng không được tạm ngưng, không sửa mã (chỉ sửa tên).
- Admin tập đoàn tạo tài khoản `COMPANY_ADMIN` cho công ty con (mã NV in hoa, duy nhất toàn tập đoàn, mật khẩu tạm, `mustChangePassword = true`).
- Các cột `lark*` để trống ở phase 1 (dành cho đồng bộ Lark giai đoạn 2).
- **Import Excel** (`/org/users/import`): mỗi file = 1 công ty. Mã NV chưa có → tạo mới; đã có trong **cùng công ty** → chỉ cập nhật
  họ tên, email, điện thoại, phòng ban, chức danh, ngày vào làm (ô trống = giữ nguyên; không đổi vai trò, trạng thái, mật khẩu);
  đã có ở công ty khác → lỗi. Chỉ lưu khi cả file không còn dòng lỗi; lúc xác nhận kiểm tra lại toàn bộ ở server; ghi theo lô 100 dòng / transaction.
  Vai trò được import: LEARNER / MANAGER / CONTENT_EDITOR.
- **Mật khẩu tạm khi import** băm bcrypt **cost 10** (thay vì 12) để import nhanh — chấp nhận được vì `mustChangePassword = true`,
  người dùng phải đổi ngay lần đầu đăng nhập và mật khẩu tự đổi vẫn băm **cost 12**. Mật khẩu tạm chỉ trả về **1 lần** trong file tải ngay sau import,
  không lưu ở đâu khác, không ghi vào `audit_logs` (audit chỉ có 1 dòng `USERS_IMPORTED`: công ty, tên file, số tạo mới / cập nhật, danh sách mã NV).

## Quy tắc 6 — Khác

- Không xoá dữ liệu nghiệp vụ: dùng `INACTIVE`, `ARCHIVED`, `CANCELLED`, `isActive = false`.
- Ghi nhiều bảng cùng lúc → `prisma.$transaction`.
- Quá hạn = `dueDate < now() AND status NOT IN (COMPLETED, CANCELLED)` — tính khi truy vấn, không lưu.
- Chứng nhận có `expiresAt` hết hạn → tác vụ hằng ngày đặt lại enrollment như bản MAJOR.
- Mẫu chứng nhận: lấy logo / người ký của công ty người học; cột nào trống thì lấy của công ty tổng.
- Mọi thao tác quản trị ghi `audit_logs` — **chỉ qua `logAudit(tx, …)`** (`src/lib/audit.ts`), trong cùng transaction với thay đổi dữ liệu.
  Mã thao tác phải có trong `AUDIT_ACTION_LABELS` (thiếu nhãn tiếng Việt → lỗi biên dịch). `logAudit` tự bỏ khoá `password` / `passwordHash` / `*Password` khỏi metadata.
  Nhật ký **chỉ ghi thêm**: không có chức năng sửa / xoá. Phạm vi xem: Admin công ty chỉ dòng có `companyId` = công ty mình; Admin tập đoàn xem tất cả.
  Index: `[companyId, createdAt]`, `[createdAt]` (xem toàn hệ thống theo ngày), `[actorId, createdAt]` (thao tác của 1 người), `[entityType, entityId]`.

## Quy tắc 7 — Lưu file (ảnh bìa, PDF…)

- Mọi file đi qua `src/lib/storage.ts` (`saveFile` / `readFile` / `deleteFile`). Hiện lưu trên ổ đĩa ở `UPLOAD_DIR`
  (mặc định `./uploads`; Docker: `/app/uploads` gắn volume `uploads`). Đổi sang S3 / Bunny Storage: chỉ sửa file đó.
- Cột lưu file (VD `courses.thumbnailUrl`) chứa **key** dạng `courses/thumbnails/<id ngẫu nhiên>.<đuôi>`, không chứa URL hay tên file gốc.
  Hiển thị qua `/api/files/<key>` (bắt buộc đăng nhập; kiểm tra quyền theo khoá học ở Việc 15).
- Loại file kiểm tra theo **nội dung** (magic bytes), không theo đuôi: ảnh JPG / PNG / WEBP ≤ 2MB, PDF ≤ 20MB.
  Key chỉ gồm `a-z 0-9 - /` + đuôi hợp lệ → không có `../`. File không bao giờ bị ghi đè (mỗi lần tải là key mới).
- Thay ảnh: lưu file mới → cập nhật DB → thành công mới xoá file cũ (DB lỗi thì xoá file vừa lưu).
- Lưu ý: server action giới hạn body 6MB (`next.config.ts`) — tải PDF lớn (≤ 20MB) cần nâng giới hạn hoặc tải qua route handler.

## Thay đổi database

```bash
npx prisma migrate dev --name mo_ta_thay_doi
```

Chạy trên máy dev (Postgres trong Docker). Commit `prisma/schema.prisma` + `prisma/migrations/`. Không sửa tay migration đã có. Server chạy `prisma migrate deploy` (container `migrate`).
