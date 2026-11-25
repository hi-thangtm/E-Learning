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
- `COMPANY_ADMIN` **không thao tác** người đang là `GROUP_ADMIN` **hoặc `COMPANY_ADMIN` khác** (sửa, đặt lại mật khẩu, khoá, mở khoá, xoá khoá đăng nhập,
  đổi vai trò) — chỉ `GROUP_ADMIN` làm được; tự sửa hồ sơ của chính mình vẫn được (Việc 29B, `canManageUser` trong `org/users/actions.ts`).
- `MANAGER`: chỉ nhân viên thuộc các phòng có `departments.managerId = user.id` **và mọi phòng con** của chúng. Chỉ xem và nhắc nhở, không giao khoá.
- Khoá học / lộ trình một công ty con **thấy được** = của công ty tổng (PUBLISHED) + của chính công ty đó.
- Quy tắc giao do công ty con tạo: `targetCompanyId` bắt buộc = chính công ty đó.
- **Quy tắc giao xem / xem trước / sửa / bật / tắt được** (`assignmentRuleScopeWhere`, `src/lib/assignment-scope.ts` — Việc 29B):
  `GROUP_ADMIN` = mọi quy tắc; người khác = chỉ quy tắc có `ownerCompanyId = targetCompanyId = user.companyId`. Quy tắc toàn tập đoàn
  (`targetCompanyId` NULL) hoặc nhắm công ty khác chỉ Admin tập đoàn thao tác — kể cả Admin công ty **thuộc công ty tổng**.
  Mở thẳng `/assign/rules/<id>` ngoài phạm vi → trang “Không tìm thấy”.
- Mọi kiểm tra quyền làm ở server (không tin dữ liệu từ trình duyệt).

### Theo dõi học tập — trước gọi “Đội của tôi” (`/team`, `/team/members` — `src/lib/scope.ts`, `src/lib/team-stats.ts`)
- **Phạm vi đội** = `getTeamScope(user)` — dùng ở MỌI truy vấn Tình hình học tập / Tiến độ từng người / Báo cáo:
  `MANAGER` = nhân viên các phòng mình làm trưởng + mọi phòng con (duyệt cây phòng ban, kể cả phòng đã ẩn; không làm trưởng phòng nào → rỗng);
  `COMPANY_ADMIN` = cả công ty mình; `GROUP_ADMIN` = toàn tập đoàn hoặc 1 công ty. Luôn chỉ người `ACTIVE` của công ty đang hoạt động.
  Xem chi tiết 1 người: `assertUserInTeam`. Trưởng phòng tải được PDF chứng nhận của người trong đội.
- **Khoá được giao** = enrollment `source` `RULE` / `ASSIGNED`, khác `CANCELLED` (tự đăng ký `SELF` không tính vào tỷ lệ).
  **Quá hạn** = `dueDate < now` và chưa `COMPLETED`. **Chưa nắm quy trình mới** = `COMPLETED` và `acknowledgedVersion < courses.currentVersion`.
  **Tỷ lệ hoàn thành** = đã xong ÷ được giao. Số liệu tính bằng truy vấn gộp (`GROUP BY` + `FILTER`), không lặp từng người.
- **Nhắc nhở**: mỗi khoá được giao chưa xong (kiểu “quá hạn” hoặc “tất cả chưa hoàn thành”) của mỗi người = 1 thông báo `REMINDER`
  (“<người nhắc> nhắc bạn hoàn thành khoá … (hạn dd/MM)” + lời nhắn ≤ 200 ký tự), `dedupeKey = reminder:<enrollmentId>:<ngày VN>`
  → mỗi khoá chỉ nhắc 1 lần / ngày. Người nhận luôn lọc lại theo phạm vi đội ở server. Nhật ký `TEAM_REMINDER_SENT`.
- **Báo cáo** (`/reports`, `src/lib/reports.ts`): cùng phạm vi `getTeamScope`; định nghĩa từng chỉ số ở **`docs/reports.md`**
  (nguồn trong code: `src/lib/report-definitions.ts`). SQL gộp, tham số hoá (`Prisma.sql`). Xuất Excel ghi `REPORT_EXPORTED`;
  “Nhắc xác nhận” bản MINOR: `REMINDER` link `/my-courses/<id>/updates`, `dedupeKey = reminder_ack:<enrollmentId>:<ngày VN>`.

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
- **Phát hành lần đầu** (đã làm — `publishCourseAction`): chỉ khi khoá `DRAFT` + `currentVersion = 0`; người phát hành = người được sửa khoá
  (`canEditCourse`: Admin tập đoàn mọi khoá, người khác khoá của công ty mình). Kiểm tra lại ở server bằng `getPublishChecks`
  (`src/lib/course-publish.ts`): có ≥ 1 bài đang dùng; bài video có video `READY` + thời lượng; bài tài liệu có nội dung hoặc PDF;
  bài kiểm tra có số câu + điểm đạt và ngân hàng đủ câu đang dùng đúng chủ đề. Đạt → `status = PUBLISHED`, `currentVersion = 1`,
  dòng `course_versions` `INITIAL` (ghi chú phát hành lưu ở `changeSummary`), audit `COURSE_PUBLISHED`. Bản MINOR / MAJOR: Việc 21.
- **Đề xuất MAJOR** (Biên soạn): tạo dòng `status = PROPOSED`, `versionNo = NULL`, `proposedById`, `proposedAt`. Admin **duyệt** → chuyển thành PUBLISHED như trên; **từ chối** → `REJECTED` + `reviewNote`. Mỗi khoá chỉ có tối đa 1 đề xuất PROPOSED cùng lúc.
- `INITIAL` và `MINOR`: Biên soạn tự phát hành. `MAJOR`: chỉ `COMPANY_ADMIN` / `GROUP_ADMIN` phát hành.
- **MAJOR**: mọi enrollment `COMPLETED` của khoá → `status = NOT_STARTED`, `progressPercent = 0`, xoá trạng thái `lesson_progress` của các bài trong khoá, `dueDate = now + dueInDays`, gửi thông báo `VERSION_MAJOR`. Lịch sử cũ (quiz_attempts, certificates) giữ nguyên vì có cột `courseVersion`.
- **MINOR**: không đặt lại gì. Người có `acknowledgedVersion < currentVersion` thấy banner "Có cập nhật", đọc `changeSummary`, bấm xác nhận → `acknowledgedVersion = currentVersion`, `acknowledgedAt = now`.
- **Bản cập nhật MINOR / MAJOR** (đã làm — `src/lib/versioning.ts`, trang soạn khoá: nút "Phát hành bản cập nhật", tab "Lịch sử phiên bản"):
  - Chỉ khoá `PUBLISHED` có `currentVersion ≥ 1`. Quyền kiểm tra ở server: **MINOR** — Biên soạn / Admin công ty của công ty sở hữu, Admin tập đoàn;
    **MAJOR trực tiếp, duyệt, từ chối** — chỉ Admin công ty của công ty sở hữu và Admin tập đoàn; **đề xuất MAJOR** — Biên soạn của công ty sở hữu.
  - Phát hành trong 1 transaction: tăng `currentVersion` có điều kiện (chống phát hành trùng), tạo / chuyển đề xuất thành dòng `PUBLISHED`
    (`changeSummary` HTML đã lọc, `dueInDays`), xử lý lượt học `COMPLETED` theo lô 500.
  - MINOR: không đổi lượt học; thông báo `VERSION_MINOR` (link `/my-courses/<id>/updates`) cho người đã học xong.
  - MAJOR: lượt học `COMPLETED` → `resetEnrollmentForRelearn` (hạn = hôm nay + `dueInDays`) + thông báo `VERSION_MAJOR`.
    **Người đang học dở (NOT_STARTED / IN_PROGRESS) KHÔNG bị đặt lại** — giữ tiến độ. Lượt CANCELLED bỏ qua.
  - Thông báo dedupe `version:<versionId>`. Màn xác nhận hiện số người bị ảnh hưởng; MAJOR phải gõ lại mã khoá.
  - **Mỗi khoá tối đa 1 đề xuất PROPOSED** (gửi thêm → bị từ chối). Gửi đề xuất → thông báo `VERSION_PROPOSED` cho Admin công ty sở hữu
    (khoá của công ty tổng → Admin tập đoàn). Từ chối bắt buộc lý do (`reviewNote`) → thông báo `VERSION_REJECTED` cho người đề xuất.
  - Nhật ký: `COURSE_VERSION_PUBLISHED` (loại, versionNo, số người bị ảnh hưởng, danh sách lượt học bị ảnh hưởng — để tab Lịch sử đếm
    "đã xác nhận / đã học xong lại X / Y người"), `COURSE_VERSION_PROPOSED`, `COURSE_VERSION_REJECTED` (lý do).
- **Phía học viên** (đã làm — `src/lib/acknowledgements.ts`):
  - Cần xác nhận = lượt học `COMPLETED` có phiên bản đã nắm (`acknowledgedVersion`, chưa có thì `completedVersion`) < `currentVersion`
    và có bản MINOR `PUBLISHED` sau phiên bản đã nắm. **Hạn xác nhận** = cuối ngày (giờ VN) `publishedAt + dueInDays` của bản MINOR mới nhất.
  - Hiện ở: banner "Quy trình có cập nhật" trang Tổng quan + trang giới thiệu khoá, badge "Có cập nhật" trên thẻ khoá,
    trang `/my-courses/<id>/updates` (tóm tắt từng bản MINOR, mới nhất trên cùng).
  - "Tôi đã đọc và nắm được" (bật sau 10 giây): chỉ chủ lượt học → `acknowledgedVersion = currentVersion`, `acknowledgedAt = now`,
    đánh dấu đã đọc các thông báo `VERSION_MINOR` của khoá đó. Không ghi `audit_logs` (đã có `acknowledgedAt`).
  - Lượt học bị đặt lại do MAJOR (chưa học xong lại, `completedVersion` < bản MAJOR) → trang khoá ghi "Khoá có thay đổi lớn ở phiên bản vX — bạn cần học lại" + tóm tắt.
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
  - Ai thao tác được quy tắc nào: xem Quy tắc 1 (`assignmentRuleScopeWhere`).
  - Khoá của quy tắc **cố định** sau khi tạo.
  - Tạo / bật lại / sửa (khi đang chạy) → giao ngay cho mọi người đang khớp (`source = RULE`, `assignmentRuleId`, hạn = hôm nay + `dueInDays`).
  - **Thu hẹp nhóm không thu hồi** lượt đã giao; chỉ áp dụng thêm cho người mới khớp. Người chuyển RA khỏi nhóm: giữ nguyên lượt đã giao.
  - **Tắt** quy tắc: chọn “Giữ các lượt đã giao” (mặc định) hoặc “Huỷ các lượt CHƯA BẮT ĐẦU của quy tắc này”. Lượt đang học / đã xong luôn giữ.
  - Khoá không còn `PUBLISHED` (VD lưu trữ) → quy tắc **tự bỏ qua**, không giao cho ai (bảng quy tắc có cảnh báo).
- **Người vào sau** — `onUserOrgChanged(userId)` chạy khi: tạo người dùng, import Excel, đổi phòng ban / chức danh / công ty, **mở khoá tài khoản**.
  Tìm mọi quy tắc đang chạy khớp công ty / chức danh / phòng ban (quy tắc “gồm phòng con” đặt ở **phòng cha / ông** cũng khớp) → giao.
- **Lộ trình học** (`learning_paths`, `learning_path_courses`; phạm vi như khoá — `src/lib/path-scope.ts`):
  - Soạn ở `/content/paths` (Biên soạn / Admin công ty / Admin tập đoàn). Mã in hoa, không trùng. Lộ trình công ty con chọn được khoá
    `PUBLISHED` của công ty mình + công ty tổng; lộ trình công ty tổng chỉ chọn khoá công ty tổng.
  - `DRAFT`: thêm / bỏ / kéo thả thứ tự. **Phát hành** cần ≥ 2 khoá, tất cả đang `PUBLISHED`.
  - `PUBLISHED`: **không đổi thứ tự, không bỏ khoá**; chỉ “Thêm khoá vào cuối” → khoá đó tự giao cho mọi người đang có lộ trình
    (người có lượt học khác `CANCELLED` gắn `learningPathId`), hạn = hạn muộn nhất của họ trong lộ trình (không có → hôm nay + `DEFAULT_DUE_DAYS`).
  - Lưu trữ → không giao mới (thủ công lẫn quy tắc), lượt đã giao giữ nguyên. Khôi phục → `PUBLISHED` nếu từng phát hành (có `PATH_PUBLISHED`), ngược lại `DRAFT`.
  - Khoá trong lộ trình bị lưu trữ → bỏ qua khi giao lộ trình; trang lộ trình hiện cảnh báo.
  - Nhật ký: `PATH_CREATED`, `PATH_UPDATED`, `PATH_PUBLISHED`, `PATH_ARCHIVED`, `PATH_RESTORED`, `PATH_COURSE_APPENDED` (khoá, số người được giao thêm).
- **Giao lộ trình** (`assignPath` / `previewPathAssignment`) = giao từng khoá theo thứ tự bằng `assignCourse`, **cùng một hạn** cho mọi khoá, ghi `learningPathId`:
  - Lượt khoá đã có giữ nguyên trạng thái (đã `COMPLETED` vẫn tính là xong); nếu `learningPathId` đang NULL thì gắn lộ trình này.
  - Xem trước theo người: chưa có lộ trình (giao mới) / đã có lộ trình / đã hoàn thành mọi khoá / bỏ qua.
  - Không gửi thông báo từng khoá; người **chưa có** lộ trình nhận 1 thông báo `COURSE_ASSIGNED` “Bạn được giao lộ trình: …”,
    link `/learning-paths/<id>`, `dedupeKey = path_assigned:<pathId>`. `ENROLLMENTS_ASSIGNED` ghi thêm `learningPathId`, `pathCode`.
  - Giao thủ công: trình giao bước 1 chọn “Khoá học” / “Lộ trình”. Quy tắc giao tự động: chọn khoá học **hoặc** lộ trình (`assignment_rules.learningPathId`),
    loại và đối tượng cố định sau khi tạo; `onUserOrgChanged` áp dụng cả quy tắc lộ trình (lộ trình `PUBLISHED`; lộ trình công ty con chỉ trong công ty đó).
- **Thư viện tự đăng ký** (`/library`, `src/lib/library.ts`):
  - Khoá hiển thị: `PUBLISHED` + `allowSelfEnroll` + `audience = EMPLOYEE` + `ownerCompanyId` = công ty tổng HOẶC công ty người xem.
    Trang giới thiệu khoá không đủ điều kiện → về `/library`. Mọi điều kiện kiểm tra lại ở server khi đăng ký.
  - Đăng ký = `assignCourse` với `source = SELF`, **không hạn** (`dueDate` NULL), `assignedById` = chính mình; lượt `CANCELLED` thì kích hoạt lại.
    `SELF` **không gửi thông báo, không ghi `audit_logs`**. Lượt không hạn không bao giờ vào nhắc `DUE_SOON` / `OVERDUE` (lọc theo `dueDate`).
  - **Huỷ đăng ký** (trang khoá của tôi): chỉ lượt `SELF`, `NOT_STARTED`, chưa có `lesson_progress` / `quiz_attempts` nào của khoá → `CANCELLED`. Không ghi audit.
- **Đánh giá khoá học** (`course_reviews`, `src/lib/reviews.ts`):
  - Chỉ người có lượt học (khác `CANCELLED`) đã `COMPLETED` hoặc có `completedVersion` (từng học xong, kể cả đang học lại sau MAJOR).
  - Mỗi người 1 đánh giá / khoá (`@@unique courseId + userId`), gửi lại = sửa. `rating` 1–5; `comment` chữ thường ≤ 1.000 ký tự, rỗng = NULL.
  - Người soạn / quản trị thấy được khoá (phạm vi như `/content/courses`) xem điểm TB + phân bố sao của **mọi** lượt đánh giá;
    **danh sách nhận xét** (kèm tên, mã NV, phòng ban) và file Excel theo phạm vi nhân viên (Quy tắc 1): Admin tập đoàn thấy hết,
    người khác chỉ thấy nhân viên công ty mình (Việc 29A).
  - Thư viện chỉ hiện điểm TB + số lượt khi **≥ 3 lượt** (ít hơn: “Chưa đủ đánh giá”), không hiện nhận xét.
  - Không ghi `audit_logs`, không gửi thông báo.
- **Khoá theo lộ trình** (`src/lib/path-lock.ts` — `getPathLock` / `getPathLocks`), kiểm tra ở SERVER:
  - Lượt học có `learningPathId` bị 🔒 khi còn khoá **đứng trước** trong lộ trình mà người đó có lượt học (khác `CANCELLED`) nhưng chưa `COMPLETED`.
    Khoá đứng trước mà người đó không có lượt học (VD đã lưu trữ nên không được giao) → bỏ qua. Lượt không có `learningPathId` → không ảnh hưởng.
  - Áp dụng: `getCourseOutline` (mọi bài khoá), `getLessonAccess` (`reason = "path"` → trang học chuyển về `/learning-paths/<id>`; chặn luôn
    tiến độ video / hoàn thành tài liệu / làm bài kiểm tra), trang giới thiệu khoá, Khoá học của tôi (thẻ mờ, nút “Xem lộ trình”),
    “Cần làm” ở Tổng quan (bỏ khoá 🔒), tác vụ hằng ngày (không nhắc `DUE_SOON` / `OVERDUE` cho lượt 🔒).
  - Hoàn thành khoá thuộc lộ trình (`onCourseCompleted`): khoá kế tiếp vừa mở → `PATH_NEXT_UNLOCKED` (dedupe `path_next:<pathId>:<courseId>`),
    màn chúc mừng có nút “Học khoá tiếp theo”; xong mọi khoá → `PATH_COMPLETED` (dedupe `path_done:<pathId>`).
  - Học viên xem lộ trình ở `/learning-paths` (tiến độ X/Y khoá, hạn chung = hạn muộn nhất) và `/learning-paths/<id>` (dòng thời gian các khoá).

## Quy tắc 4 — Học và kiểm tra

- Học tuần tự theo chương (`course_sections.sortOrder`) rồi bài (`lessons.sortOrder`).
- **Nguồn video** (`lessons.videoProvider`, `videoId`, `videoStatus`, `durationSeconds`) — **không lưu file video trên server**:
  - `YOUTUBE`: chỉ lưu mã 11 ký tự (server tự tách từ link). Video phải để **Không công khai** và cho phép nhúng — **ai có link đều xem được**,
    không dùng cho quy trình nội bộ cần bảo mật. Phát qua `www.youtube-nocookie.com`. Thời lượng đo bằng trình phát lúc gắn; `videoStatus = READY` ngay.
  - `BUNNY`: trình duyệt tải **thẳng** lên Bunny Stream bằng TUS (server chỉ tạo video + ký chữ ký 1 giờ, API key không rời server).
    Tải xong → `PROCESSING` → `READY` (lưu `durationSeconds`) hoặc `FAILED`. Phát bằng iframe kèm **token hết hạn sau 6 giờ**,
    tạo ở server mỗi lần mở bài. Cần đủ Library ID, API key, Token key — nhập ở Hệ thống › Cài đặt (system_settings `BUNNY_CREDENTIALS`, khoá mã hoá AES-256-GCM, ưu tiên) hoặc `.env` `BUNNY_STREAM_LIBRARY_ID` / `BUNNY_STREAM_API_KEY` / `BUNNY_STREAM_TOKEN_KEY` (vận hành: `docs/bunny-setup.md`).
  - **Video đang tải lên** (Việc 31B, security-review #8): `lessons.pendingVideoId` + `pendingVideoCreatedAt` — video đã tạo trên Bunny nhưng
    CHƯA gắn vào bài. Vé tải lên (HMAC `lessonId:videoId:expire`) chỉ được nhận khi `videoId = pendingVideoId`; hoàn tất / huỷ là cập nhật
    **có điều kiện** `WHERE pendingVideoId = videoId` → mỗi vé dùng đúng 1 lần. Tải lại → xoá video chờ cũ trên Bunny. Tạo video: tối đa
    20 lần / giờ / người. Chờ quá **24 giờ** → tác vụ hằng ngày xoá trên Bunny + bỏ khỏi bài. Index `lessons.videoId` cho webhook.
  - **Cập nhật trạng thái** (`src/lib/bunny-sync.ts`, luôn hỏi lại Bunny bằng API key — không tin dữ liệu gửi tới): dialog bài học hỏi mỗi 10 giây;
    webhook `POST /api/bunny/webhook` (chỉ đọc `VideoGuid`; kiểm chữ ký nếu có Read-Only key (giao diện hoặc `BUNNY_STREAM_READONLY_KEY`)); tác vụ hằng ngày hỏi lại mọi bài
    `PROCESSING`; mở trang soạn khoá / trang học hỏi lại bài `PROCESSING` (tối đa 1 lần / phút / bài). Đổi trạng thái → audit `LESSON_VIDEO_SET`.
  - Phát hành lần đầu **và** bản cập nhật MINOR / MAJOR / duyệt MAJOR bị chặn khi còn bài video đang dùng chưa `READY` (nêu rõ chương › bài).
  - Thay video / đổi nguồn / gỡ video / **xoá hẳn** bài: xoá video cũ (và video đang chờ) trên Bunny (lỗi chỉ ghi log, không chặn). **Ẩn** bài: giữ video.
  - Bài chỉ tính được hoàn thành khi `videoStatus = READY` và có `durationSeconds`.
- VIDEO xong khi `maxWatchedSeconds ≥ durationSeconds × minWatchPercent / 100`. Vị trí nhảy quá `maxWatchedSeconds + 15` giây là tua → không tăng `maxWatchedSeconds`.
  - Tiến độ video gửi về `POST /api/learn/progress` (mỗi 10 giây khi phát, khi tạm dừng / hết video, `sendBeacon` lúc rời trang) →
    `recordVideoProgress` (`src/lib/learning.ts`). **Chống gửi số giả:** `maxWatchedSeconds` chỉ tăng tối đa
    min(thời gian thực từ `lesson_progress.updatedAt`, **25 giây**) × 2 + 5 giây mỗi lần gửi (trình phát gửi mỗi 10 giây — mở bài rồi bỏ đi
    lâu không được cộng dồn, Việc 29B); luôn ghi `lastPositionSeconds`. Trình duyệt kéo về khi tua vượt; bài đã xong tua tự do.
- **Mở bài = bắt đầu học** (`startLearning`): lượt học `NOT_STARTED → IN_PROGRESS` + `startedAt`; bài VIDEO / DOCUMENT chưa xong
  được tạo / chạm `lesson_progress` (`updatedAt` = lúc mở — mốc cho chống gửi số giả và 15 giây của tài liệu). Mọi kiểm tra quyền học bài
  dùng `getLessonAccess`: lượt học khác CANCELLED + bài chưa ẩn thuộc khoá + không bị khoá tuần tự. Không ghi `audit_logs` cho tiến độ học.
- DOCUMENT xong khi người học bấm "Đã đọc xong" — chỉ nhận khi bài đã mở ≥ 15 giây (server kiểm tra theo `lesson_progress.updatedAt`).
- **Hoàn thành bài / khoá** — `completeLesson` (1 transaction, dùng chung cho video, tài liệu, bài kiểm tra): đánh dấu bài xong (đã xong thì giữ),
  tính lại `progressPercent`; đủ 100% → `COMPLETED`, `completedAt`, `completedVersion = acknowledgedVersion = currentVersion`, `acknowledgedAt`,
  gọi `onCourseCompleted` (Việc 22 cấp chứng nhận, Việc 23 mở khoá tiếp theo trong lộ trình). Lượt đã COMPLETED không bị hạ trạng thái khi xem lại.
- **Xem file** (`/api/files/...`, `src/lib/file-access.ts`): file khoá học (`courses/...`: ảnh bìa, PDF bài học, ảnh câu hỏi) chỉ trả cho người có lượt học
  khoá đó (khác CANCELLED) hoặc GROUP_ADMIN / COMPANY_ADMIN / CONTENT_EDITOR thấy được khoá theo phạm vi (Quy tắc 1); sai → 403.
  File không gắn khoá nào → 404. File mẫu chứng nhận của công ty (`companies/<id>/...`: logo, chữ ký) → người thuộc công ty `<id>`, `GROUP_ADMIN`,
  `COMPANY_ADMIN` công ty con khi file là của công ty tổng (mẫu mặc định), hoặc người có chứng nhận của chính mình đang dùng file đó
  (`templateSnapshot.logoKey / signatureKey`) — Việc 29B. File khác (VD `branding/`): chỉ cần đăng nhập.
- QUIZ (`src/lib/quiz.ts`): rút ngẫu nhiên `questionCount` câu từ `questions` của **cùng khoá** với điều kiện `isActive AND isApproved` (và `topic = lessons.questionTopic` nếu có),
  **xáo thứ tự câu và phương án**. Xong khi có 1 lần `passed = true` → `completeLesson`.
  - **Số lượt tối đa = `maxAttempts + lesson_progress.bonusAttempts`** (`maxAttempts` NULL = không giới hạn), đếm số `quiz_attempts` trong
    **phiên bản khoá hiện tại** (`courseVersion = courses.currentVersion`). Admin cấp thêm lượt ở Giao thủ công (1–5 lượt/lần, ghi `QUIZ_ATTEMPTS_GRANTED`).
  - `quiz_attempts.answers` = snapshot đầy đủ của đề: `[{ questionId, type, content, imageUrl, options: [{id,text,isCorrect}], explanation, selected }]`
    — chấm và xem lại theo snapshot (câu hỏi sửa sau không ảnh hưởng). `attemptNo` = số lần trước trong phiên bản + 1.
  - Mỗi lúc chỉ 1 lượt dở; mở lại khi còn giờ → làm tiếp lượt đó. Lưu từng câu ngay khi chọn; không nhận lưu khi đã nộp hoặc quá `deadline + 30 giây`
    (`deadline = startedAt + timeLimitMinutes`). Hết giờ → tự nộp (trình duyệt) và mỗi lần mở trang bài kiểm tra server chấm các lượt dở đã quá hạn.
  - Chấm: câu một đáp án đúng khi chọn đúng phương án đúng; câu nhiều đáp án đúng khi tập đã chọn **trùng khớp** tập đáp án đúng (không điểm từng phần).
    `score = round(số câu đúng ÷ tổng câu × 100)`, `passed = score ≥ passingScore`.
  - **Đề gửi trình duyệt không có `isCorrect` và `explanation`.** Đáp án / giải thích chỉ trả về sau khi nộp, khi `showAnswers = true`
    **VÀ** lượt đó đạt hoặc đã hết lượt (`attemptNo` hoặc số lượt đã nộp ≥ `maxAttempts + bonusAttempts`; `maxAttempts` NULL → chỉ khi đạt),
    chỉ với lượt của phiên bản hiện tại — chống nộp bài trống để lấy đáp án (Việc 29B, `answersRevealable`). Áp dụng cả khi xem lại lượt cũ.
  - Lưu câu trả lời / nộp bài kiểm tra lại quyền học (`learnerQuizAccess`: lượt học khác CANCELLED, bài chưa ẩn); chấm điểm trong transaction
    khoá dòng `quiz_attempts` (`SELECT … FOR UPDATE`, cùng khoá với lưu câu trả lời).
  - Xem trước (người soạn): làm thử không ghi `quiz_attempts`, luôn hiện đáp án. Không ghi `audit_logs` cho việc làm bài.
- `progressPercent` = bài xong ÷ tổng bài × 100, tính lại mỗi khi một bài xong.

### Ngân hàng câu hỏi (`questions`, trang `/content/questions`)
- Câu hỏi thuộc **khoá học**. Phạm vi như khoá học (Quy tắc 1): chỉ sửa câu của khoá mình được sửa (`canEditCourse`);
  khoá của công ty tổng thì công ty con chỉ xem / xuất Excel.
- `options` = `[{ id, text, isCorrect }]`. **`id` ổn định**: sửa câu hỏi giữ id phương án cũ, phương án mới có id mới (không đánh lại).
- Hợp lệ (form và import dùng chung `questionInputSchema`, `src/lib/question-bank.ts`): nội dung bắt buộc; 2–6 phương án, không rỗng,
  không trùng (bỏ khoảng trắng thừa, không phân biệt hoa/thường); `SINGLE` = đúng 1 đáp án đúng; `MULTIPLE` = ít nhất 1.
- Câu tạo tay / import: `isAiCreated = false`, `isApproved = true`. **Đang dùng** = `isActive AND isApproved` (được rút vào đề).
- Tắt / bật = `isActive`. **Xoá hẳn chỉ khi khoá chưa phát hành lần nào** (`currentVersion = 0`); đã phát hành → chỉ tắt.
  Xoá câu có ảnh → xoá file ảnh.
- Ảnh minh hoạ lưu ở `courses/<courseId>/questions/` (tối đa 2MB, JPG/PNG/WEBP), xem qua `/api/files` theo quy tắc file khoá học.
- Import Excel luôn **thêm mới** (tối đa 1.000 câu, 5MB), còn dòng lỗi thì không lưu gì; câu trùng nội dung với câu đã có chỉ cảnh báo.
  File mẫu = file xuất (xuất từ khoá này, import vào khoá khác được). Không hỗ trợ ảnh.
- Nhật ký `QUESTION_*` chỉ ghi chủ đề + 80 ký tự đầu nội dung, **không ghi đáp án**.
- **Điều kiện phát hành bài kiểm tra** (`getQuizBankIssues` — dùng ở bước phát hành Việc 21, hiện cảnh báo ở tab Nội dung):
  mỗi bài QUIZ đang dùng phải có `questionCount`, `passingScore`, và số câu đang dùng phù hợp chủ đề ≥ `questionCount`.

## Quy tắc 5 — Tài khoản

- Admin tạo tài khoản (thủ công / import Excel): đặt mật khẩu ban đầu, `mustChangePassword = true` → chạy quy tắc bắt buộc.
- `employeeCode` duy nhất toàn tập đoàn (là tên đăng nhập). Nếu các công ty con trùng mã, thêm tiền tố mã công ty (VD: `CTYA-00123`).
- Sai mật khẩu 5 lần → `lockedUntil = now + 15 phút`. Đăng nhập đúng → `failedLoginCount = 0`.
- **Đăng nhập không để lộ tài khoản** (Việc 29A, `src/auth.ts`): luôn so mật khẩu TRƯỚC — mã không tồn tại vẫn so với một hash giả cùng cost 12
  (thời gian phản hồi như nhau). Sai mật khẩu → **luôn** chỉ báo “Mã nhân viên hoặc mật khẩu không đúng” (vẫn tăng `failedLoginCount` nếu mã tồn tại;
  đang khoá tạm thì không đếm thêm). Chỉ khi mật khẩu ĐÚNG mới báo: đang khoá tạm / tài khoản INACTIVE / công ty tạm ngưng.
  Giới hạn tần suất: 10 lần / phút / IP, 5 lần / phút / mã NV (`src/lib/rate-limit.ts`; IP chỉ đọc từ `X-Forwarded-For` khi `TRUST_PROXY=true`).
- **Huỷ phiên cũ** — `users.sessionsValidAfter`: phiên (JWT, claim `authAt` = thời điểm đăng nhập) cấp TRƯỚC mốc này bị coi là hết hiệu lực
  (`getCurrentUser` trả `null` → về trang đăng nhập). Đặt `sessionsValidAfter = now` khi: **tự đổi mật khẩu** (rồi cấp ngay phiên mới cho chính
  trình duyệt đang đổi — các trình duyệt khác bị đăng xuất), **admin đặt lại mật khẩu**, **khoá tài khoản**, **đổi vai trò**, **chuyển công ty**.
- Nghỉ việc → `status = INACTIVE` (không xoá). Đặt lại mật khẩu → `mustChangePassword = true`.
- **Công ty tạm ngưng** (`companies.isActive = false`) → mọi nhân viên của công ty đó **không đăng nhập được**
  (thông báo "Công ty của bạn đang tạm ngưng sử dụng hệ thống"); phiên đang mở mất hiệu lực ở request kế tiếp
  (`getCurrentUser` trả `null`). Dữ liệu giữ nguyên; kích hoạt lại thì đăng nhập bình thường.
- Công ty chỉ có 2 cấp: công ty con luôn có `parentId` = công ty tổng. Công ty tổng không được tạm ngưng, không sửa mã (chỉ sửa tên).
- Admin tập đoàn tạo tài khoản `COMPANY_ADMIN` cho công ty con (mã NV in hoa, duy nhất toàn tập đoàn, mật khẩu tạm, `mustChangePassword = true`).
- **Đồng bộ Lark** (Việc L1 — `src/lib/lark/*`, trang Hệ thống › Kết nối Lark, hướng dẫn cấu hình `docs/lark-setup.md`):
  - Cả tập đoàn dùng CHUNG 1 tổ chức Lark. Lark là **nguồn chính** cho: họ tên, email (email doanh nghiệp ưu tiên), điện thoại (+84… lưu thành 0…),
    phòng ban, công ty, ngày vào làm, nghỉ việc, trưởng phòng. **Không** đồng bộ vai trò và chức danh (vẫn sửa ở E-Learning).
  - `companies.larkDepartmentId` = phòng ban GỐC trên Lark ứng với công ty. Công ty của 1 phòng / 1 người = công ty có `larkDepartmentId` là tổ tiên gần
    nhất trên cây Lark. Không ghép 2 công ty vào cùng 1 phòng hoặc 2 phòng lồng nhau. Phòng gốc = cấp công ty (người ở đó không thuộc phòng ban nào).
  - `departments.larkDepartmentId` = open_department_id. Phòng mới: mã `LK-` + hash ổn định, không trùng trong công ty. Lần đầu: phòng có sẵn chưa gắn
    Lark, trùng tên (không phân biệt hoa thường), cùng công ty, cùng phòng cha → GHÉP (giữ mã, quy tắc giao theo phòng vẫn đúng). Phòng không còn trên Lark
    → `isActive = false` nếu không còn người / phòng con đang dùng (không thì chỉ cảnh báo).
  - `users.larkUserId` = Lark user_id. Khớp người theo `larkUserId`, không có thì theo employee_no in hoa = `employeeCode` (rồi gán `larkUserId`).
    Bỏ qua + báo cáo: thiếu employee_no, 2 người Lark trùng mã, mã trùng tài khoản đã gắn người Lark khác, ngoài mọi nhánh đã ghép.
    Tài khoản không có `larkUserId` và không khớp ai (VD ADMIN) → giữ nguyên (“Chỉ có ở E-Learning”).
  - Người mới từ Lark: LEARNER, `passwordSet = false` (hash ngẫu nhiên — đăng nhập bằng mật khẩu luôn báo sai), `mustChangePassword = false`.
    Admin **đặt lại mật khẩu** → `passwordSet = true` (tự đổi mật khẩu cũng vậy).
  - `users.inactiveSource`: ai khoá tài khoản — `"LARK"` (nghỉ việc / đóng băng / không còn trên Lark) hoặc `"ADMIN"` (quản trị bấm Khoá). Lark báo đang làm
    lại → chỉ tự mở khi `"LARK"`; khoá do `"ADMIN"` (hoặc trống — khoá trước khi có Lark) không tự mở, ghi vào báo cáo. Admin mở khoá → `inactiveSource = null`.
  - Đổi công ty theo Lark = chuyển công ty như Việc 6 (gỡ trưởng phòng ở công ty cũ, `sessionsValidAfter`); Admin tập đoàn không tự chuyển công ty.
    Trưởng phòng: `leader_user_id` → `managerId` (cùng công ty, đang làm; LEARNER → MANAGER); Lark bỏ trưởng phòng → gỡ `managerId`, không hạ vai trò.
  - Người liên kết Lark: dialog sửa chỉ đổi vai trò + chức danh; không chuyển công ty bằng tay; import Excel báo lỗi dòng của người này.
  - Người mới / đổi phòng / đổi công ty / mở lại → `onUserOrgChanged` (quy tắc giao tự động).
  - **Chốt chặn**: kế hoạch khoá > 5% người đang hoạt động hoặc > 20 người → tác vụ hằng ngày / script KHÔNG áp dụng (ghi lỗi); chạy tay phải tick
    “Tôi đã kiểm tra, vẫn áp dụng”. Áp dụng luôn cần chạy thử trước (server tính lại kế hoạch, so dấu vân tay).
  - Áp dụng trong 1 transaction + `pg_try_advisory_xact_lock(20260101)`; 1 dòng audit `LARK_SYNC_RUN` (người chạy hoặc Hệ thống, trigger, số lượng từng loại,
    tối đa 500 thay đổi, cảnh báo, lỗi). Ghép công ty ↔ phòng Lark: audit `LARK_MAPPING_UPDATED`.
  - Tác vụ hằng ngày chạy “Đồng bộ Lark” ĐẦU TIÊN, chỉ khi đã cấu hình và đã có ít nhất 1 lần áp dụng thủ công. Chạy tay: `npm run job:lark-sync`.
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
- **Tác vụ hằng ngày** (`src/lib/jobs/daily.ts` → `runDailyJob`, giờ Asia/Ho_Chi_Minh). Chỉ xét người `ACTIVE` thuộc công ty đang hoạt động.
  Mỗi phần chạy riêng (1 phần lỗi không làm hỏng phần khác), duyệt theo lô 500, mỗi lúc chỉ 1 lượt chạy (`pg_try_advisory_xact_lock`
  giữ trong 1 transaction chỉ dùng để giữ khoá — bản xact vì Prisma dùng nhiều kết nối). Kết thúc ghi `audit_logs` `JOB_DAILY_RUN`
  (`actorId` = người bấm, NULL = tự động; metadata: số lượng từng phần, lỗi, thời gian chạy). Chạy nhiều lần trong ngày không gửi trùng (dedupeKey).
  - **Sắp đến hạn**: lượt học chưa COMPLETED / CANCELLED, hạn từ bây giờ tới hết ngày (hôm nay + 3) → `DUE_SOON`, link `/my-courses/<courseId>`.
  - **Quá hạn**: hạn < bây giờ → `OVERDUE` "Khoá X đã quá hạn N ngày"; nhắc ngày đầu quá hạn rồi **mỗi 7 ngày** (tuần `w = (N − 1) / 7` trong dedupeKey).
  - **Bài kiểm tra bỏ dở**: lượt chưa nộp, đã quá `startedAt + timeLimitMinutes + 30 giây` → chấm theo bài đã lưu (đạt → hoàn thành bài).
  - **Chứng nhận sắp hết hạn**: chưa thu hồi, hết hạn trong 30 ngày tới → `CERTIFICATE_EXPIRING`.
  - **Chứng nhận hết hạn → học lại**: chưa thu hồi, đã hết hạn, là chứng nhận MỚI NHẤT của người đó cho khoá đó, và lượt học khoá đó đang
    `COMPLETED` → `resetEnrollmentForRelearn` (`src/lib/learning.ts`, dùng chung với bản MAJOR): lượt học → `NOT_STARTED`, 0%,
    `startedAt` / `completedAt` = NULL, hạn = hôm nay + `DEFAULT_DUE_DAYS`; **giữ** `completedVersion`, `acknowledgedVersion`;
    `lesson_progress` các bài của khoá về chưa xong (xoá vị trí video, `bonusAttempts = 0`); **không xoá** `quiz_attempts`, `certificates`.
    Kèm thông báo "Chứng nhận khoá X đã hết hạn — vui lòng học lại". Chạy lại không làm lại vì lượt học không còn COMPLETED.
  - **Dọn thông báo**: xoá thông báo đã đọc tạo trước 180 ngày, chưa đọc tạo trước 365 ngày (thông báo không phải dữ liệu nghiệp vụ).
  - **Chưa xác nhận bản MINOR quá hạn**: lượt học COMPLETED chưa nắm bản hiện tại, bản MINOR mới nhất đã quá hạn xác nhận → `VERSION_MINOR`
    "Bạn chưa xác nhận cập nhật quy trình X (quá hạn)", dedupe `ack_overdue:<enrollmentId>:v<currentVersion>:w<tuần>` (nhắc lại mỗi 7 ngày).
  - Cách gọi: `POST /api/jobs/daily` với `Authorization: Bearer <CRON_SECRET>` (thiếu biến / sai → 401; lập lịch trên VPS ở giai đoạn I);
    `npm run job:daily` (máy dev); Admin tập đoàn bấm "Chạy ngay" ở `/system/jobs` (xem 30 lần chạy gần nhất).
- Mẫu chứng nhận: lấy logo / người ký của công ty người học; cột nào trống thì lấy của công ty tổng.
- **Chứng nhận** (`src/lib/certificates.ts`, PDF `src/lib/certificate-pdf.tsx`):
  - Cấp tự động trong transaction hoàn thành khoá (`onCourseCompleted`) khi `courses.hasCertificate`. Mã `CERT-<năm>-<6 ký tự>`
    (bảng chữ không gây nhầm `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, sinh bằng crypto, thử lại nếu trùng). `recipientName` = họ tên lúc cấp,
    `courseVersion` = phiên bản đã học xong, `expiresAt = issuedAt + certificateValidMonths` tháng (NULL = vĩnh viễn). Thông báo `CERTIFICATE_ISSUED`.
  - Mỗi **lần hoàn thành** chỉ 1 chứng nhận (chạy lại / cấp bù không trùng). Học lại sau khi hết hạn = lần hoàn thành mới → chứng nhận mới.
    Chứng nhận đã thu hồi không được cấp lại tự động.
  - **`templateSnapshot`** `{ companyName, logoKey, signerName, signerTitle, signatureKey }` = mẫu của công ty người học lúc cấp
    (cột trống lấy của công ty tổng). Sửa mẫu sau KHÔNG đổi chứng nhận đã cấp; file ảnh cũ còn được snapshot dùng thì không xoá.
  - Thu hồi: `revokedAt` (không xoá) — Admin công ty (người công ty mình), Admin tập đoàn; bắt buộc lý do, audit `CERTIFICATE_REVOKED`.
    PDF đã thu hồi có chữ chìm "ĐÃ THU HỒI". Trạng thái: Đã thu hồi / Hết hạn / Sắp hết hạn (≤ 30 ngày) / Còn hiệu lực.
  - Tải PDF (`/api/certificates/<id>/pdf`): chủ chứng nhận, Admin công ty cùng công ty, Admin tập đoàn. Mã QR trỏ tới `<APP_URL>/verify/<mã>`.
  - Tra cứu công khai `/verify/<mã>` (không đăng nhập, `noindex`): chỉ họ tên, khoá + phiên bản, ngày cấp, hạn, đơn vị cấp — KHÔNG mã NV, phòng ban, điểm.
  - Mẫu theo công ty ở `/system/certificate-templates` (ảnh ≤ 1MB, lưu `companies/<id>/`), audit `CERTIFICATE_TEMPLATE_UPDATED`.
  - Cấp bù: `npm run job:backfill-certificates`.
- Mọi thao tác quản trị ghi `audit_logs` — **chỉ qua `logAudit(tx, …)`** (`src/lib/audit.ts`), trong cùng transaction với thay đổi dữ liệu.
  Mã thao tác phải có trong `AUDIT_ACTION_LABELS` (thiếu nhãn tiếng Việt → lỗi biên dịch). `logAudit` tự bỏ khoá `password` / `passwordHash` / `*Password` khỏi metadata.
  Nhật ký **chỉ ghi thêm**: không có chức năng sửa / xoá. Phạm vi xem: Admin công ty chỉ dòng có `companyId` = công ty mình; Admin tập đoàn xem tất cả.
  Index: `[companyId, createdAt]`, `[createdAt]` (xem toàn hệ thống theo ngày), `[actorId, createdAt]` (thao tác của 1 người), `[entityType, entityId]`.
- **Thông báo** (`notifications`, `src/lib/notifications.ts`): luôn tạo qua `notify(db, { userIds, type, title, link, dedupeKey })`
  (tạo hàng loạt, `skipDuplicates`). `type` thuộc danh sách trong `src/lib/notification-types.ts`. `link` phải là đường dẫn nội bộ
  bắt đầu bằng `/` (không phải `//`), sai thì bỏ link. Không ghi `audit_logs` cho thông báo. Đọc / đánh dấu đã đọc chỉ đụng thông báo của chính người đó.
  - **`dedupeKey`** + `@@unique([userId, dedupeKey])`: cùng người + cùng key chỉ có 1 dòng — dùng cho thông báo do tác vụ tự động tạo
    (chạy lại không gửi trùng). Quy ước `<loại>:<đối tượng>[:<mốc>]` (chữ thường), VD `due_soon:<enrollmentId>:<yyyy-mm-dd hạn>`,
    `overdue:<enrollmentId>:<yyyy-mm-dd hạn>:w<tuần>`, `cert_expiring:<certificateId>`, `cert_expired:<certificateId>`, `version_major:<courseId>:v<n>`.
    Có mốc (hạn, phiên bản) để khi hạn / phiên bản đổi thì được báo lại. `NULL` = không chống trùng (VD giao khoá: giao lại sau khi huỷ vẫn báo);
    Postgres cho phép nhiều dòng `dedupeKey` NULL.
  - **Gửi qua Lark** (Việc L2, `src/lib/lark/notify.ts`): `notify()` đánh dấu `larkStatus = PENDING` (+ `larkNextAttemptAt`) khi loại đó đang
    bật gửi qua Lark (cài đặt `system_settings.LARK_NOTIFY` = `{ enabled, since, types }`, sửa ở Hệ thống › Kết nối Lark) — KHÔNG gọi mạng trong
    transaction nghiệp vụ. Bộ gửi nền (khởi động ở `src/instrumentation.ts`, mỗi 10 giây + đánh thức ngay sau khi tạo; tác vụ hằng ngày
    chạy thêm 1 lượt dự phòng) nhận việc bằng cập nhật có điều kiện (không gửi trùng) rồi gửi thẻ tin nhắn bot tới `users.larkUserId`.
    Trạng thái: `SENT` (+ `sentToLarkAt`), `SKIPPED` (chưa liên kết Lark / tài khoản khoá / loại đã tắt / tạo trước mốc `since` — không gửi bù),
    `FAILED` (lỗi cố định như người nhận ngoài phạm vi app, hoặc lỗi tạm quá 5 lần; thử lại sau 1 / 5 / 15 / 60 phút). `larkAttempts`, `larkError`
    (lý do ≤ 300 ký tự). `larkStatus = NULL` = không thuộc diện gửi. Index `(larkStatus, larkNextAttemptAt)`. Cần app chạy 1 tiến trình
    (bộ gửi + giới hạn tần suất nằm trong bộ nhớ).

## Quy tắc 7 — Lưu file (ảnh bìa, PDF…)

- Mọi file đi qua `src/lib/storage.ts` (`saveFile` / `readFile` / `deleteFile`). Hiện lưu trên ổ đĩa ở `UPLOAD_DIR`
  (mặc định `./uploads`; Docker: `/app/uploads` gắn volume `uploads`). Đổi sang S3 / Bunny Storage: chỉ sửa file đó.
- Cột lưu file (VD `courses.thumbnailUrl`) chứa **key** dạng `courses/thumbnails/<id ngẫu nhiên>.<đuôi>`, không chứa URL hay tên file gốc.
  Hiển thị qua `/api/files/<key>` (bắt buộc đăng nhập; kiểm tra quyền theo khoá học ở Việc 15).
- Loại file kiểm tra theo **nội dung** (magic bytes), không theo đuôi: ảnh JPG / PNG / WEBP ≤ 2MB, PDF ≤ 20MB.
  Key chỉ gồm `a-z 0-9 - /` + đuôi hợp lệ → không có `../`. File không bao giờ bị ghi đè (mỗi lần tải là key mới).
- Thay ảnh: lưu file mới → cập nhật DB → thành công mới xoá file cũ (DB lỗi thì xoá file vừa lưu).
- Lưu ý: server action giới hạn body 6MB (`next.config.ts`) — tải PDF lớn (≤ 20MB) cần nâng giới hạn hoặc tải qua route handler.

## Quy tắc 8 — Cài đặt hệ thống (`system_settings`)

- Chỉ **Admin tập đoàn** sửa, ở `/system/settings`. Mỗi lần đổi ghi `SETTINGS_UPDATED` (`before` → `after` từng khoá đổi; khôi phục mặc định có `reset`).
- Khai báo **1 nơi duy nhất**: `src/lib/settings-meta.ts` (nhóm, nhãn, mô tả, giới hạn, mặc định). Đọc ở server: `getSettings()` /
  `getSetting(key)` (`src/lib/settings.ts`, React `cache` → 1 truy vấn / request). Dòng thiếu hoặc sai kiểu (zod) → dùng mặc định.
- `value` là JSON: số, chuỗi, hoặc `null` (logo).

| Khoá | Nhóm | Kiểu / giới hạn | Mặc định | Dùng ở |
|---|---|---|---|---|
| `SYSTEM_NAME` | Nhận diện | chuỗi 2–50 ký tự | `E-Learning` | Tiêu đề tab, thanh bên, trang đăng nhập, `/verify`, tác giả PDF chứng nhận, người tạo file Excel |
| `SYSTEM_LOGO_KEY` | Nhận diện | key file `branding/<id>.png\|webp` hoặc `null` | `null` (biểu tượng mặc định) | Thanh bên, trang đăng nhập, `/verify` |
| `DEFAULT_DUE_DAYS` | Mặc định khoá học | số nguyên 1–365 (ngày) | 30 | Trình giao khoá, form quy tắc, xem trước quy tắc, học lại khi chứng nhận hết hạn, khoá thêm vào lộ trình, hạn bản cập nhật |
| `DEFAULT_MIN_WATCH_PERCENT` | Mặc định khoá học | 50–100 (%) | 90 | Điền sẵn khi tạo bài video mới |
| `DUE_SOON_DAYS` | Nhắc nhở | 1–30 (ngày) | 3 | Tác vụ hằng ngày: nhắc sắp đến hạn |
| `OVERDUE_REMIND_INTERVAL_DAYS` | Nhắc nhở | 1–30 (ngày) | 7 | Nhắc lại khi quá hạn + nhắc xác nhận bản MINOR quá hạn (chu kỳ `w` trong dedupeKey) |
| `CERT_EXPIRING_DAYS` | Nhắc nhở | 7–180 (ngày) | 30 | Nhắc chứng nhận sắp hết hạn |
| `NOTIFICATION_READ_RETENTION_DAYS` | Dọn dẹp | 30–730 (ngày) | 180 | Xoá thông báo đã đọc cũ hơn |
| `NOTIFICATION_UNREAD_RETENTION_DAYS` | Dọn dẹp | 90–1095 (ngày) | 365 | Xoá thông báo chưa đọc cũ hơn |

- **Logo**: chỉ nhận **PNG / WEBP ≤ 500KB** (kiểm tra magic bytes), **không nhận SVG** — SVG là XML có thể chứa `<script>`, `onload`,
  `<foreignObject>`… lọc an toàn rất dễ sót. Phục vụ **công khai** qua `GET /api/branding/logo?v=<id>` (trang đăng nhập và `/verify`
  cần khi chưa đăng nhập): chỉ trả đúng file đang đặt trong cài đặt, `Cache-Control: public, max-age=300`, `ETag`, `nosniff`.
  Đổi / xoá logo → xoá file cũ.
- Không đưa vào cài đặt: số lần đăng nhập sai / thời gian khoá tài khoản (`src/auth.ts`).

## Thay đổi database

```bash
npx prisma migrate dev --name mo_ta_thay_doi
```

Chạy trên máy dev (Postgres trong Docker). Commit `prisma/schema.prisma` + `prisma/migrations/`. Không sửa tay migration đã có. Server chạy `prisma migrate deploy` (container `migrate`).

### Index phục vụ hiệu năng (Việc 30 — đo trên `elearning_perf`, xem `docs/performance.md`)

| Bảng | Index | Truy vấn hưởng lợi | Đo (`EXPLAIN ANALYZE`, 226k dòng) |
|---|---|---|---|
| `lesson_progress` | `[userId, updatedAt]` (migration `perf_indexes`) | “Lần học gần nhất” (`MAX(updatedAt)` theo người — báo cáo Theo người, Đội của tôi), “Người học 30 ngày qua” (Dashboard tập đoàn), “Tiếp tục học” (bài dở mới nhất của 1 người) | 84 → 25 ms và 48 → 25 ms (quét cả bảng → index-only scan) |

Các index ứng viên khác (`lesson_progress[updatedAt]`, `notifications[userId, createdAt]`, `notifications[createdAt]`, `enrollments[userId, status]`,
`certificates[userId, courseId, issuedAt]`, `quiz_attempts[userId, lessonId]`) **không thêm**: truy vấn tương ứng đã < 15 ms hoặc planner không dùng.
