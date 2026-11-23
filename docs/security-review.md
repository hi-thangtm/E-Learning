# Rà soát bảo mật — Việc 29A

Ngày rà: 23/11/2026 (Việc 29A) · Sửa tiếp: Việc 29B — các dòng ghi “(29B)” · Phạm vi: toàn bộ `src/` (Next.js 16.4.6, Auth.js 5.0.0-beta.32, Prisma 6, PostgreSQL 17).
Bối cảnh: hệ thống chạy trên Internet, chứa dữ liệu nhân sự và điểm thi của cả tập đoàn.

Cách rà: (1) script kiểm kê mọi `page.tsx` / `layout.tsx` / `route.ts` / file `"use server"` và hàm kiểm tra quyền đầu tiên mà chúng gọi;
(2) `npm run check:auth` (mọi hàm export phải gọi `requireUser` / `requireRole` / `getCurrentUser`, trực tiếp hoặc qua hàm cùng file);
(3) đọc code theo 3 mảng: tổ chức – hệ thống – giao khoá; nội dung – câu hỏi – lộ trình; học viên – bài kiểm tra – báo cáo.
Các lỗi mức Trung bình đều được xác minh lại bằng đọc code. Kiểm tra lúc chạy (curl vào `npm run dev`): header CSP có nonce,
21/21 thẻ `<script>` của trang đăng nhập mang nonce, `/verify` 200 khi chưa đăng nhập, `/api/files` 401 khi chưa đăng nhập.

Ký hiệu vai trò: **GA** = GROUP_ADMIN · **CA** = COMPANY_ADMIN · **CE** = CONTENT_EDITOR · **MG** = MANAGER · **LN** = LEARNER · **Mọi người** = mọi vai trò đã đăng nhập.

---

## 1. Phần 1 — đã sửa (tóm tắt)

| Hạng mục | Cách làm | File |
|---|---|---|
| Đăng nhập không lộ tình trạng tài khoản | So mật khẩu TRƯỚC; mã không tồn tại → so với hash giả cost 12 tạo lúc khởi động; sai mật khẩu → luôn `invalid` (đếm sai nếu mã tồn tại và không đang khoá tạm); chỉ báo `locked` / `inactive` / `company_inactive` khi mật khẩu ĐÚNG | `src/auth.ts` |
| Huỷ phiên cũ | `users.sessionsValidAfter` (migration `sessions_valid_after`); JWT có claim `authAt` (không dùng `iat` vì Auth.js ký lại token khi gia hạn); `getCurrentUser` trả `null` nếu `authAt < sessionsValidAfter`. Đặt mốc khi: tự đổi mật khẩu (rồi `signIn` lại ngay → giữ phiên trình duyệt hiện tại), admin đặt lại mật khẩu, khoá tài khoản, đổi vai trò (kể cả tự nâng LEARNER → MANAGER khi chỉ định trưởng phòng — bổ sung trong phiên rà này), chuyển công ty | `src/lib/current-user.ts`, `change-password/actions.ts`, `org/users/actions.ts`, `org/departments/actions.ts` |
| Giới hạn tần suất | Cửa sổ trượt trong bộ nhớ: đăng nhập 10/phút/IP + 5/phút/mã NV; `/verify` 30/phút/IP; tìm nhanh 60/phút/người; `/api/learn/progress` 30/phút/người; `/api/files` 120/phút/người. IP chỉ lấy từ `X-Forwarded-For` khi `TRUST_PROXY=true` | `src/lib/rate-limit.ts` |
| Header bảo mật | CSP nonce mỗi request (`script-src 'self' 'nonce-…' 'strict-dynamic'`, không cần `'unsafe-inline'` cho script); `style-src 'unsafe-inline'` vì thuộc tính `style=""` (thanh tiến độ, recharts, Base UI) không gắn nonce được; `frame-src 'self'` youtube-nocookie + iframe.mediadelivery.net; `connect-src` + video.bunnycdn.com; `img-src` + i.ytimg.com; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS chỉ ở production | `src/proxy.ts`, `next.config.ts` |
| `server-only` | Mọi file server trong `src/lib` (db, auth, bunny, storage, quiz, learning, assignment, reports, scope, settings, notifications, certificates, jobs…); 22 file còn lại là hàm thuần / nhãn dùng chung với client. Script tsx chạy với `--require ./scripts/allow-server-only.cjs` | `src/lib/*`, `scripts/allow-server-only.cjs`, `package.json` |
| Xuất Excel | `safeText` / `safeRow`: ô chữ bắt đầu `= + - @`, tab, xuống dòng → thêm `'`. `addSimpleSheet` tự áp dụng; chỗ ghi ô trực tiếp dùng `safeText` (bổ sung cột “Lỗi” của import câu hỏi trong phiên rà này); nhập lại bỏ dấu `'` | `src/lib/excel.ts` |
| `npm run check:auth` | Quét file `"use server"` trong TOÀN BỘ `src/` (mở rộng trong phiên rà này — trước chỉ `src/app`, bỏ sót `src/components/quick-search/actions.ts`) và `route.ts` trong `src/app`; lan truyền qua hàm cùng file; 4 ngoại lệ có lý do. Kết quả: 116 hàm, 0 vi phạm | `scripts/check-auth.ts` |

---

## 2. Bảng toàn bộ trang, server action, route API

Kiểm tra quyền: mọi trang trong `(app)` / `(learn)` còn đi qua layout `requireUser()`. “Phạm vi” = lọc dữ liệu theo Quy tắc 1 ngay trong truy vấn.

### 2.1 Trang

| Đường dẫn | Ai dùng | Kiểm tra quyền | Lọc phạm vi | Kết quả |
|---|---|---|---|---|
| `/login` | Chưa đăng nhập | `getCurrentUser` (đã đăng nhập → chuyển trang) | — | Đạt |
| `/change-password` | Mọi người | `requireUser({ allowMustChangePassword })` | Chính mình | Đạt |
| `/verify`, `/verify/[code]` | Công khai | Không (cố ý) + rate limit 30/phút/IP | Chỉ họ tên, khoá, phiên bản, ngày cấp / hạn / thu hồi, đơn vị cấp | Đạt (xem #13) |
| `/` | — | Chuyển trang | — | Đạt |
| `/[...slug]` (đang xây dựng) | Theo menu | `requireUser` + `canAccess` | — | Đạt |
| `/dashboard` | Mọi người | `requireUser` | `getMy*` theo `user.id` | Đạt |
| `/my-courses`, `/my-courses/[courseId]`, `/my-courses/[courseId]/updates` | Mọi người | `requireUser` | `userId` + lượt học khác CANCELLED | Đạt |
| `/learn/[courseId]/[lessonId]` | Mọi người | `requireUser` | `getLessonAccess` (lượt học, bài chưa ẩn, khoá tuần tự, khoá lộ trình) | Đạt |
| `/library`, `/library/[courseId]` | Mọi người | `requireUser` | `findLibraryCourse` (công ty mình / công ty tổng, PUBLISHED, cho tự đăng ký) | Đạt |
| `/learning-paths`, `/learning-paths/[id]` | Mọi người | `requireUser` | `getMyPath` (lượt học gắn `learningPathId`) | Đạt |
| `/certificates` | Mọi người | `requireUser` | `userId` | Đạt |
| `/notifications` | Mọi người | `requireUser` | `userId` | Đạt |
| `/team`, `/team/members`, `/team/members/[id]` | MG, CA, GA | `requireRole` | `getTeamScope`, `assertUserInTeam` | Đạt |
| `/reports` | MG, CA, GA | `requireRole` | `resolveReportContext` (người theo `getTeamScope`); khoá qua `findReportCourse` | Đạt (29B) |
| `/content/courses`, `/content/courses/[id]` | GA, CA, CE | `requireRole` | `findCourseInScope` + `canEditCourse` (readOnly; đề xuất MAJOR / bản bị từ chối chỉ khi sửa được) | Đạt (29B) |
| `/content/questions`, `/content/questions/import` | GA, CA, CE | `requireRole` | `courseVisibleWhere`; phương án + nút Xuất / Import Excel chỉ khi `canEdit` | Đạt (29B) |
| `/content/paths`, `/content/paths/[id]` | GA, CA, CE | `requireRole` | `findPathInScope` + `canEditPath` | Đạt |
| `/content/categories` | GA, CA, CE (chỉ GA sửa) | `requireRole` | Dữ liệu chung | Đạt |
| `/assign/manual`, `/assign/manual/new` | GA, CA | `requireRole` | `enrollmentScopeWhere`, `assignableCoursesWhere` | Đạt |
| `/assign/rules`, `/assign/rules/new`, `/assign/rules/[id]` | GA, CA | `requireRole` | `assignmentRuleScopeWhere` (owner = target = công ty mình); ngoài phạm vi → `notFound()` | Đạt (29B) |
| `/org/users`, `/org/users/[id]`, `/org/users/import` | GA, CA | `requireRole` | `companyId` (CA), `auditScopeWhere`; nút thao tác ẩn với Admin công ty khác | Đạt (29B) |
| `/org/departments` | GA, CA | `requireRole` | `companyId` | Đạt |
| `/org/positions` | GA, CA (chỉ GA sửa) | `requireRole` | Đếm người theo công ty | Đạt |
| `/system/audit-logs` | GA, CA | `requireRole` | `auditScopeWhere` | Đạt |
| `/system/certificate-templates` | GA, CA | `requireRole` | Công ty mình + công ty tổng | Đạt |
| `/system/companies`, `/system/settings`, `/system/jobs`, `/system/overview` | GA | `requireRole(["GROUP_ADMIN"])` | Toàn tập đoàn (đúng vai trò) | Đạt |

### 2.2 Route API / route handler

| Route | Ai dùng | Kiểm tra quyền | Lọc phạm vi / ghi chú | Kết quả |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | Công khai | Auth.js (CSRF token riêng) | Ngoại lệ check:auth | Đạt |
| `GET /api/branding/logo` | Công khai | Không (cố ý) | Chỉ file trong `SYSTEM_LOGO_KEY`, PNG/WEBP, `CSP: sandbox` | Đạt |
| `POST /api/jobs/daily` | Bộ lập lịch | `CRON_SECRET` Bearer, `timingSafeEqual` | Ngoại lệ check:auth | Đạt |
| `GET /api/files/[...key]` | Mọi người | `getCurrentUser` + rate limit | `canReadFile`: `courses/…` → lượt học hoặc soạn / quản trị theo phạm vi; `companies/<id>/…` → cùng công ty / GA / chứng nhận của mình | Đạt (29B) |
| `POST /api/learn/progress` | Mọi người | `getCurrentUser` + rate limit + Origin | `recordVideoProgress` → `getLessonAccess`; trần 25 giây / lần gửi | Đạt (29B) |
| `POST /api/lessons/[lessonId]/document` | GA, CA, CE | `getCurrentUser` + vai trò + Origin | `findLessonForEdit` | Đạt |
| `GET /api/certificates/[id]/pdf` | Chủ, CA cùng công ty, GA, MG của đội | `getCurrentUser` | `canDownloadCertificate` + `isUserInTeam` | Đạt |
| `GET /api/notifications/unread-count` | Mọi người | `getCurrentUser` | `userId` | Đạt |
| `GET /content/courses/[id]/reviews/export` | GA, CA, CE | `requireRole` | `listCourseReviews` — nay lọc nhân viên công ty mình | Đạt (đã sửa #4) |
| `GET /content/questions/export` | GA, CA, CE | `requireRole` | `findCourseForView` + `canEditCourse` (chỉ xem → 403) | Đạt (29B) |
| `GET /content/questions/template` | GA, CA, CE | `requireRole` | Không có dữ liệu riêng | Đạt |
| `GET /org/users/import/template` | GA, CA | `requireRole` | `resolveImportCompany` | Đạt |
| `GET /reports/export` | MG, CA, GA | `requireRole` | `resolveReportContext`; khoá qua `findReportCourse` | Đạt (29B) |
| `GET /team/members/export` | MG, CA, GA | `requireRole` | `getTeamScope` | Đạt |
| `GET /system/audit-logs/export` | GA, CA | `requireRole` | `buildAuditWhere` → `auditScopeWhere` | Đạt |
| `GET /system/certificate-templates/preview` | GA, CA | `requireRole` | Công ty mình | Đạt |

### 2.3 Server action (theo file)

| File (trong `src/app` trừ dòng cuối) | Hàm | Ai dùng | Kiểm tra quyền / phạm vi | Kết quả |
|---|---|---|---|---|
| `login/actions.ts` | loginAction | Chưa đăng nhập | Ngoại lệ — rate limit trong `src/auth.ts` | Đạt |
| `change-password/actions.ts` | changePasswordAction | Mọi người | `requireUser`, so mật khẩu hiện tại | Đạt |
| `(learn)/learn/actions.ts` | markDocumentRead | Mọi người | `completeDocumentLesson` → `getLessonAccess` + ≥ 15 giây | Đạt |
| `(learn)/learn/quiz-actions.ts` | startQuizAction | Mọi người | `learnerQuizAccess` + giới hạn lượt | Đạt |
| 〃 | saveQuizAnswerAction, submitQuizAction, quizResultAction | Chủ lượt làm | `attempt.userId`, hạn giờ, `learnerQuizAccess` khi lưu / nộp, `answersRevealable` | Đạt (29B) |
| 〃 | previewQuizStartAction, previewQuizSubmitAction | GA, CA, CE | `requireRole` + `courseVisibleWhere`, không ghi DB | Đạt |
| `(app)/my-courses/[courseId]/actions.ts` | cancelSelfEnrollmentAction, saveMyReviewAction | Mọi người | `userId` + `courseId` | Đạt |
| `(app)/my-courses/[courseId]/updates/actions.ts` | acknowledgeVersionAction | Mọi người | `userId` | Đạt |
| `(app)/library/[courseId]/actions.ts` | enrollAction | Mọi người | `findLibraryCourse` | Đạt |
| `(app)/notifications/actions.ts` | getLatest…, markNotificationRead…, markAllNotificationsRead… | Mọi người | `where: { id, userId }`, `safeLink` | Đạt |
| `(app)/team/members/actions.ts` | previewReminderAction, sendReminderAction | MG, CA, GA | `resolveUserIds` → `scope.where` | Đạt |
| `(app)/reports/actions.ts` | remindAcknowledgeAction | MG, CA, GA | Người nhận theo phạm vi; khoá qua `findReportCourse` | Đạt (29B) |
| `(app)/content/courses/actions.ts` | createCourseAction | GA, CA, CE | `ownerCompanyId = actor.companyId` | Đạt |
| `(app)/content/courses/[id]/actions.ts` | updateCourseInfo, archive / restoreCourse, getPublishChecks, publishCourse | GA, CA, CE | `findCourseInScope` + `canEditCourse`; phát hành có điều kiện v0 | Đạt |
| `(app)/content/courses/[id]/content-actions.ts` | create / rename / remove / restoreSection, create / remove / restore / updateLesson, removeLessonFile, reorderContent | GA, CA, CE | `findCourseForEdit` / `findSectionForEdit` / `findLessonForEdit`; reorder đối chiếu đủ tập id | Đạt |
| `(app)/content/courses/[id]/version-actions.ts` | previewImpact, publishVersion, approve / rejectProposal | MINOR: CE, CA, GA · MAJOR: CA, GA | `canManageMajor` / `canProposeMajor`, kiểm lại trong `versioning.ts` | Đạt |
| `(app)/content/courses/[id]/video-actions.ts` | setYoutubeVideo, prepare / complete / cancelBunnyUpload, checkBunnyStatus, removeVideo, getVideoPlayback | GA, CA, CE | `findLessonForEdit` + vé HMAC `lessonId:videoId` | Đạt (xem #8) |
| `(app)/content/questions/actions.ts` | create / update / toggle / deleteQuestion | GA, CA, CE | `findCourseForEdit` / `findQuestionForEdit` | Đạt |
| `(app)/content/questions/import/actions.ts` | validate…, questionErrorReport…, confirm… | GA, CA, CE | `findCourseForEdit` mỗi bước | Đạt |
| `(app)/content/paths/actions.ts` | createPath, updatePathInfo, add / remove / reorder / appendCourse, publish / archive / restorePath | GA, CA, CE | `findPathInScope` + `canEditPath`; khoá chọn lọc bằng `selectableCoursesWhere` | Đạt |
| `(app)/content/categories/actions.ts` | create / update / toggle / moveCategory | GA | `requireRole(["GROUP_ADMIN"])` | Đạt |
| `(app)/assign/manual/actions.ts` | extendEnrollment, cancelEnrollment, getQuizGrantOptions, grantQuizAttempts | GA, CA | `findEnrollment` + `enrollmentScopeWhere`; bài thuộc đúng khoá; ngày qua `validIsoDate` | Đạt (29B) |
| `(app)/assign/manual/new/actions.ts` | searchLearners, previewManual, assignManual | GA, CA | `loadTarget`, `activeLearnerWhere`, `resolveUserIds` lọc lại id (`safeParse`); ngày có thật | Đạt (29B) |
| `(app)/assign/rules/actions.ts` | previewRule, saveRule, disableRule, enableRule | GA, CA | `findRule` → `assignmentRuleScopeWhere` | Đạt (29B) |
| `(app)/org/users/actions.ts` | createUser, updateUser, lock / unlockUser, clearLoginLock, resetPassword | GA, CA | `resolveOrg`, `canManageUser`, `findTargetInScope`; CA không gán GA, không sửa người công ty khác, không thao tác CA khác, không tự đổi vai trò / công ty | Đạt (29B) |
| `(app)/org/users/[id]/certificate-actions.ts` | revokeCertificateAction | GA, CA | `canRevokeCertificate` | Đạt |
| `(app)/org/users/import/actions.ts` | validateImport, errorReport, confirmImport | GA, CA | `resolveImportCompany`; `updateMany` có `companyId`; không nêu công ty của mã trùng | Đạt (29B) |
| `(app)/org/departments/actions.ts` | create / update / toggleDepartment | GA, CA | `canAccessCompany`, phòng cha / trưởng phòng cùng công ty, chống vòng lặp | Đạt |
| `(app)/org/positions/actions.ts` | create / update / togglePosition | GA | `requireRole(["GROUP_ADMIN"])` | Đạt |
| `(app)/system/companies/actions.ts` | create / update / toggleCompany, createCompanyAdmin | GA | `requireRole(["GROUP_ADMIN"])`; admin chỉ cho công ty con | Đạt |
| `(app)/system/settings/actions.ts` | save / resetSettingsGroup, upload / removeLogo | GA | `requireRole(["GROUP_ADMIN"])`; zod theo `SETTING_META` | Đạt |
| `(app)/system/jobs/actions.ts` | runDailyJobAction | GA | `requireRole(["GROUP_ADMIN"])` | Đạt |
| `(app)/system/certificate-templates/actions.ts` | updateCertificateTemplateAction | GA, CA | Ép `actor.companyId` | Đạt |
| `src/components/quick-search/actions.ts` | searchEverything | MG, CE, CA, GA | `getTeamScope` / `companyId` / `courseVisibleWhere` + rate limit | Đạt |

---

## 3. IDOR — id nhận từ trình duyệt

Không tìm thấy IDOR cho phép **sửa / ghi** dữ liệu ngoài phạm vi. Mọi id đi qua helper lọc trong truy vấn:

| Loại id | Nơi kiểm tra |
|---|---|
| userId (quản trị) | `findTargetInScope`, `canManageUser` (`org/users/actions.ts`); `assertUserInTeam` (MG) |
| courseId / sectionId / lessonId (soạn) | `findCourseForEdit` / `findSectionForEdit` / `findLessonForEdit` (`src/lib/course-content.ts`), `canEditCourse` |
| courseId / lessonId (học) | `getLessonAccess`, `getMyEnrollment` (theo `userId`) |
| enrollmentId | `findEnrollment` + `enrollmentScopeWhere` (`src/lib/assignment-scope.ts`) |
| attemptId | `attempt.userId === user.id` (`src/lib/quiz.ts`) |
| certificateId | `canDownloadCertificate`, `canRevokeCertificate` (`src/lib/certificates.ts`) |
| versionId / proposal | `canManageMajor` / `canProposeMajor` + `courseId` của khoá đã kiểm tra (`src/lib/versioning.ts`) |
| questionId | `findQuestionForEdit` (`content/questions/scope.ts`) |
| pathId | `findPathInScope` + `canEditPath`; học viên: `getMyPath` |
| ruleId | `assignmentRuleScopeWhere` (`src/lib/assignment-scope.ts`) — owner = target = công ty mình (29B) |
| notificationId | `where: { id, userId }` |
| fileKey | `isValidKey` + `canReadFile` (`src/lib/file-access.ts`) |
| Bunny videoId | Vé HMAC gắn `lessonId:videoId` do server tạo (`src/lib/bunny.ts`) + chỉ nhận đúng `lessons.pendingVideoId`, dùng 1 lần (#8 — đã sửa Việc 31B) |
| Bộ lọc báo cáo (company / department / course) | `resolveReportContext`, `getTeamScope`; tham số ngoài phạm vi bị bỏ qua; khoá qua `findReportCourse` (29B) |

Các lỗi **lộ dữ liệu khi xem** #1, #3, #4, #10, #11, #12 đều đã sửa (#4 ở 29A, còn lại ở 29B).

## 4. Dữ liệu trả về trình duyệt

- `passwordHash`: chỉ đọc trong `src/auth.ts` và `change-password/actions.ts` để so; không select ở chỗ nào gửi ra client. `getCurrentUser` bỏ `sessionsValidAfter` trước khi trả.
- Đề bài kiểm tra (`toPaperQuestion`, `src/lib/quiz.ts`) **không** có `isCorrect` / `explanation`; id phương án ngẫu nhiên. Đáp án chỉ trả sau khi nộp, `showAnswers = true` VÀ lượt đạt / đã hết lượt (29B, #2).
- Trang `/content/questions`: phương án và file xuất chỉ cho người sửa được khoá (29B, #1).
- Email / điện thoại: chỉ của người trong phạm vi (trang Người dùng, Đội của tôi). `members-table` không nhận email.
- Tên / mã NV / phòng ban người công ty khác: tab Đánh giá (#4 — **đã sửa**).
- `DataTable` là server component → hàm `cell` và dữ liệu dòng không bị tuần tự hoá sang client.

## 5. `dangerouslySetInnerHTML`

| Chỗ dùng | Nguồn nội dung | Kết quả |
|---|---|---|
| `src/components/learning/lesson-content.tsx` (`LessonContent`) | Nội dung bài tài liệu: lọc khi lưu (`content-actions.ts`) + lọc lại khi đọc (`getLessonDetail`) · Tóm tắt phiên bản: lọc khi lưu (`version-actions.ts` `cleanSummary`) + lọc lại ở `acknowledgements.ts`, `version-history.tsx`, `content/courses/[id]/page.tsx` (2 chỗ cuối bổ sung trong phiên rà này) · Ô soạn thảo trong `version-dialog.tsx`: HTML Tiptap của chính người đang gõ (không phải dữ liệu người khác) | Đạt |
| `src/components/ui/chart.tsx` | CSS biến màu do code tạo từ cấu hình biểu đồ | Đạt |

Bộ lọc `sanitizeLessonHtml` (`sanitize-html`): chỉ `p br h2 h3 strong em u ul ol li a`, link http/https, tự thêm `rel="noopener noreferrer"`.

## 6. Tải file lên / phục vụ file

- **Loại file theo magic bytes** (`detectFileType`), không theo đuôi: ảnh JPG/PNG/WEBP ≤ 2MB; PDF ≤ 20MB; logo PNG/WEBP ≤ 500KB (không nhận SVG). Excel import ≤ 5MB (`bodySizeLimit` 6MB).
- Route tải PDF kiểm `Content-Length` TRƯỚC khi đọc body.
- **Chặn `../`**: key do server tạo (`<folder>/<uuid>.<ext>`), `KEY_REGEX` chỉ `a-z 0-9 - /` + đuôi hợp lệ, kiểm ở cả đọc / ghi / xoá. `FOLDER_REGEX` cho thư mục.
- **Phục vụ**: `/api/files` → `Content-Disposition: inline` + `X-Content-Type-Options: nosniff` + Content-Type theo đuôi đã kiểm; logo → thêm `Content-Security-Policy: default-src 'none'; sandbox`; Excel / PDF chứng nhận → `attachment` kèm `filename*=UTF-8''`.
- Ngoại lệ phạm vi: file ngoài `courses/` chỉ cần đăng nhập (#9).

## 7. CSRF

| Điểm ghi dùng cookie | Bảo vệ |
|---|---|
| Mọi server action | Next.js so `Origin` với `Host` / `X-Forwarded-Host` (mặc định) |
| `POST /api/learn/progress` | So `Origin` cùng host (trả 403) |
| `POST /api/lessons/[lessonId]/document` | So `Origin` cùng host |
| `POST /api/jobs/daily` | Không dùng cookie — Bearer `CRON_SECRET` |
| Auth.js (đăng nhập / đăng xuất) | CSRF token riêng của Auth.js |
| Route GET (xuất Excel, PDF, đếm thông báo) | Chỉ đọc, không đổi dữ liệu |

Cookie phiên `SameSite=Lax` chặn thêm POST từ trang khác. Đạt.

## 8. Biến môi trường

- Không có biến `NEXT_PUBLIC_*` nào trong mã nguồn / `.env.example` → không bí mật nào bị đóng gói vào JS trình duyệt.
- `.gitignore`: `.env*` và `/uploads` (đã kiểm bằng `git check-ignore`). `.env.example` đang được git theo dõi (pattern không ảnh hưởng file đã track).
- `.env.example`: các bí mật để trống (`AUTH_SECRET`, `BUNNY_*`, `CRON_SECRET`); mật khẩu Postgres / pgAdmin là **giá trị mẫu** (`DoiMatKhauNay123`, `DoiMatKhauPgAdmin123`) — phải đổi khi lên VPS (mục 13). Không đọc `.env` thật trong lần rà này.

## 9. Lỗi khi chạy production

- Không có chỗ nào trả `error.message` / stack / câu SQL thô cho trình duyệt; lỗi nghiệp vụ trả thông báo tiếng Việt cố định. Các lỗi đặc biệt (`STALE:`, `ALREADY_PUBLISHED`) được đổi thành câu tiếng Việt.
- Lỗi không bắt được: Next.js production chỉ hiện trang lỗi chung kèm `digest`, chi tiết chỉ ghi log server. Trang lỗi tiếng Việt `(app)/error.tsx`, `(learn)/error.tsx`, `global-error.tsx`, `not-found.tsx` chỉ hiện mã lỗi (`digest`) để báo quản trị, không hiện nội dung lỗi (29B, #16).

## 10. `npm audit --omit=dev`

Chạy lại sau Việc 29B (đã chuyển `shadcn` sang `devDependencies`): **6 mục (4 cao, 2 trung bình)** — giảm từ 10.
`shadcn`, `ts-morph`, `@ts-morph/common`, `minimatch` không còn trong cây production. **Không** chạy `npm audit fix --force`
(sẽ nâng Prisma 7 / exceljs 3 — phá vỡ dự án; CLAUDE.md cấm Prisma 7).

| Gói | Mức | Đường vào | Ảnh hưởng thực tế | Đề xuất |
|---|---|---|---|---|
| `prisma` | Cao | trực tiếp (devDependency, CLI — npm vẫn tính vì `@prisma/client` cần) | Chỉ chạy lúc `generate` / `migrate deploy`, không nhận dữ liệu người dùng | Theo dõi bản vá dòng 6.x; KHÔNG nâng Prisma 7 |
| `@prisma/config` | Cao | qua `prisma` | Như trên | Như trên |
| `deepmerge-ts` (<8.0.0) — tràn stack khi gộp object vòng | Cao | qua `@prisma/config` | Chỉ gộp cấu hình Prisma do ta viết | Không cần xử lý |
| `effect` (≤3.22.0) — ReDoS `Schema.TemplateLiteral` | Cao | qua `@prisma/config` | Không dùng với chuỗi từ người dùng | Không cần xử lý |
| `exceljs` | Trung bình | trực tiếp | Do `uuid` bên dưới | Theo dõi bản exceljs mới |
| `uuid` (<11.1.1) — thiếu kiểm biên khi truyền `buf` cho v3/v5/v6 | Trung bình | qua `exceljs` | exceljs chỉ dùng `v4()` không truyền `buf` → không ảnh hưởng | Không cần xử lý; có thể `overrides` uuid ≥ 11.1.1 nếu muốn audit sạch (cần thử) |

Phiên bản: **Next.js 16.4.6** = bản mới nhất của dòng 16.x trên npm tại ngày rà. **next-auth 5.0.0-beta.32** = beta mới nhất.

## 11. Cookie phiên (Auth.js v5, cấu hình mặc định — `src/auth.ts` không ghi đè)

- `HttpOnly`: có. `SameSite=Lax`. `Path=/`.
- `Secure` + tên `__Secure-authjs.session-token`: tự bật khi `AUTH_URL` là `https://` (Auth.js suy ra từ giao thức) → **bắt buộc AUTH_URL https khi lên VPS**.
- Phiên JWT ký bằng `AUTH_SECRET`, hết hạn sau 12 giờ; quyền / trạng thái / `sessionsValidAfter` đọc lại từ DB mỗi request.

---

## 12. Bảng phát hiện

| # | Mức độ | Mô tả | File | Đề xuất sửa | Trạng thái |
|---|---|---|---|---|---|
| 1 | Trung bình | Người CHỈ XEM khoá công ty tổng (CE / CA công ty con) xuất được Excel câu hỏi có **đáp án đúng + giải thích**, kể cả câu đã tắt. Nếu chính họ được giao khoá đó → làm bài kiểm tra với đáp án trong tay, lấy chứng nhận. Giao diện đã ẩn phương án khi chỉ xem nhưng route xuất thì không | `src/app/(app)/content/questions/export/route.ts:14` (`findCourseForView`) | Dùng `findCourseForEdit`, hoặc bỏ `isCorrect` / `explanation` khi `!canEditCourse`; ẩn nút “Xuất Excel” khi chỉ xem | Đã sửa (29B) — route xuất chỉ cho người `canEditCourse` (chỉ xem → 403); nút Xuất / Import Excel chỉ hiện khi sửa được khoá |
| 2 | Trung bình | Bài `showAnswers = true` + nhiều lượt (hoặc `maxAttempts` rỗng): bắt đầu → nộp bài trống → nhận đáp án mọi câu; lặp lại để gom ngân hàng câu hỏi rồi làm lượt thật. `showAnswers` đọc theo giá trị hiện tại → bật sau thì lộ cả lượt cũ | `src/lib/quiz.ts:466-519` | Chỉ trả `details` khi đã đạt hoặc đã hết lượt (hoặc thêm chế độ “xem đáp án sau khi đạt”); lưu `showAnswers` vào lượt làm lúc bắt đầu | Đã sửa (29B) — `answersRevealable`: chỉ trả đáp án khi lượt đạt hoặc đã hết lượt (maxAttempts NULL → chỉ khi đạt), chỉ lượt của phiên bản hiện tại; áp cả khi xem lại; giao diện báo “Đáp án sẽ hiện khi bạn đạt hoặc đã dùng hết lượt làm bài” |
| 3 | Trung bình | COMPANY_ADMIN thuộc **công ty tổng** (vai trò này gán được ở `resolveOrg`) xem / bật / tắt / sửa mọi quy tắc giao của Admin tập đoàn, kể cả quy tắc toàn tập đoàn: tắt kèm “huỷ lượt chưa bắt đầu” huỷ lượt của nhân viên công ty con; sửa thì `targetCompanyId` bị ép về công ty tổng | `src/app/(app)/assign/rules/actions.ts:159-185, 376-441`; `assign/rules/page.tsx:28`; `assign/rules/[id]/page.tsx:21` | Người không phải GA: lọc thêm `targetCompanyId = actor.companyId`; hoặc cấm vai trò CA ở công ty tổng (kể cả import) và ghi vào Quy tắc 1 | Đã sửa (29B) — `assignmentRuleScopeWhere`: người không phải GA chỉ quy tắc owner = target = công ty mình (danh sách, xem trước, sửa, bật, tắt); `/assign/rules/<id>` ngoài phạm vi → `notFound()` |
| 4 | Trung bình | Tab Đánh giá + file xuất hiện họ tên, mã NV, phòng ban của nhân viên **công ty khác** (khoá công ty tổng được mọi công ty học) | `src/lib/reviews.ts` (`listCourseReviews`) | Người không phải GA chỉ thấy nhận xét của nhân viên công ty mình; điểm tổng quan vẫn tính trên mọi lượt; ghi chú trên tab; cập nhật `docs/database.md` | **Đã sửa** |
| 5 | Thấp | `check:auth` chỉ quét `src/app` → bỏ sót server action ở `src/components/quick-search/actions.ts` (bản thân action có `requireRole`) | `scripts/check-auth.ts` | Quét `"use server"` trong toàn bộ `src/` | **Đã sửa** |
| 6 | Thấp | Tiến độ video: thời gian bỏ trang cũng được cộng (`allowed = prevMax + elapsed×2 + 5`). Mở bài, đóng tab, chờ, gửi 1 request (tự đặt Origin ngoài trình duyệt) → xong bài không cần xem | `src/lib/learning.ts` (`recordVideoProgress`) | Trần `elapsed` mỗi lần gửi (VD 25 giây, trình phát gửi mỗi 10 giây) | Đã sửa (29B) — mỗi lần gửi chỉ tính tối đa 25 giây thời gian thực (`MAX_PROGRESS_GAP_SECONDS`) |
| 7 | Thấp | `saveAnswer` / `submitAttempt` không kiểm lại quyền học (lượt CANCELLED / bài ẩn vẫn lưu và nộp được, có điểm nhưng không tính hoàn thành); `gradeAttempt` đọc bài làm không khoá dòng → điểm và đáp án lưu có thể lệch khi lưu + nộp chạy song song | `src/lib/quiz.ts:386-477` | Gọi `learnerQuizAccess` trước khi lưu / nộp; chấm trong transaction có `SELECT … FOR UPDATE` | Đã sửa (29B) — lưu / nộp gọi `learnerQuizAccess` trước; `gradeAttempt` chấm trong transaction có `SELECT … FOR UPDATE` (tham số hoá) |
| 8 | Thấp | Vé tải Bunny dùng lại được trong hạn (~2 giờ) → gắn lại video đã xoá, bài kẹt PROCESSING (cần quyền sửa chính bài đó); `prepareBunnyUploadAction` không giới hạn số lần → tạo video rỗng hàng loạt, tốn hạn mức Bunny | `src/lib/bunny.ts:121-128`; `src/app/(app)/content/courses/[id]/video-actions.ts:121-186` | Lưu `pendingVideoId` vào bài và chỉ nhận đúng id đó một lần; rate limit + tác vụ dọn video mồ côi | **Đã sửa (31B)** — `lessons.pendingVideoId` + cập nhật có điều kiện (vé dùng 1 lần), rate limit 20 / giờ / người, tác vụ hằng ngày xoá video chờ > 24 giờ; kiểm bằng `e2e/12-bunny.spec.ts`, `e2e/99-bunny-gioi-han.spec.ts` |
| 9 | Thấp | File ngoài `courses/` (VD ảnh chữ ký / logo mẫu chứng nhận `companies/<id>/…`) ai đăng nhập cũng đọc được nếu biết key (key 128 bit ngẫu nhiên — khó đoán, rủi ro khi key bị lộ) | `src/lib/file-access.ts:17` | `companies/<id>/` chỉ cho người cùng công ty, GA, hoặc khi file đang dùng trên chứng nhận của người xem | Đã sửa (29B) — `companies/<id>/…`: cùng công ty, GA, Admin công ty con với file của công ty tổng (mẫu mặc định), hoặc có chứng nhận của mình dùng file đó |
| 10 | Thấp | Báo cáo / nhắc nắm phiên bản trả mã, tên, phiên bản của **khoá bất kỳ** khi biết id (kể cả DRAFT công ty khác); danh sách học viên vẫn rỗng | `src/lib/reports.ts:311`; `src/app/(app)/reports/actions.ts:20` | Chỉ nhận khoá có lượt học của người trong phạm vi hoặc lọc `courseVisibleWhere` | Đã sửa (29B) — `findReportCourse`: khoá có lượt học của người trong phạm vi hoặc thuộc `courseVisibleWhere`; ngoài phạm vi → như không tồn tại |
| 11 | Thấp | Người chỉ xem khoá công ty tổng thấy đề xuất MAJOR đang chờ, lý do từ chối, tên người đề xuất | `src/app/(app)/content/courses/[id]/page.tsx:152-183`; `version-history.tsx` | Chỉ hiện banner và dòng PROPOSED / REJECTED khi `canEditCourse` | Đã sửa (29B) — banner đề xuất MAJOR và dòng PROPOSED / REJECTED chỉ khi `canEditCourse` |
| 12 | Thấp | Import nhân viên báo “Mã NV đã thuộc công ty X” → CA công ty con dò được mã NV và công ty của người khác (không ghi DB, không ghi nhật ký) | `src/app/(app)/org/users/import/import-service.ts:511` | Báo chung “Mã NV đã được dùng trong tập đoàn” | Đã sửa (29B) — thông báo chung “Mã NV đã được dùng trong tập đoàn.”, bỏ select mã công ty |
| 13 | Thấp | Khi `TRUST_PROXY` ≠ `true`, mọi request chung 1 khoá IP “untrusted” → 10 lần đăng nhập / 30 lần tra cứu `/verify` mỗi phút cho **cả hệ thống**; một người spam là chặn tất cả | `src/lib/rate-limit.ts:55` | Bật `TRUST_PROXY=true` khi chạy sau Caddy (mục 13); có thể kiểm lúc khởi động ở production | Chưa sửa — để Việc 34 (cấu hình VPS) |
| 14 | Thấp | Ngày hạn giao khoá chỉ kiểm regex (`2026-02-31` lọt qua, bị đẩy sang tháng sau); `selectionSchema.parse` ném lỗi 500 thay vì báo lỗi | `src/app/(app)/assign/manual/new/actions.ts:43, 84-90`; `assign/manual/actions.ts:55` | `safeParse`; kiểm `toISOString().slice(0,10) === value` như `validIsoDate` | Đã sửa (29B) — `validIsoDate` (chuyển sang `src/lib/format.ts`) cho ngày hạn / gia hạn; `safeParse` thay `parse`, lỗi tiếng Việt; hạn tối đa 5 năm |
| 15 | Thấp | CA đặt lại mật khẩu (nhận mật khẩu tạm) / khoá / hạ vai trò **CA khác cùng công ty** → chiếm tài khoản ngang cấp | `src/app/(app)/org/users/actions.ts:204-207, 586-616` | Nếu không mong muốn: chỉ GA thao tác trên người đang là CA | Đã sửa (29B) — `canManageUser`: người đích là COMPANY_ADMIN → chỉ GA (trừ tự sửa hồ sơ); giao diện ẩn nút |
| 16 | Thấp | Chưa có trang lỗi tiếng Việt (`error.tsx`, `global-error.tsx`) — người dùng thấy trang lỗi tiếng Anh mặc định (không lộ chi tiết) | `src/app` | Thêm `error.tsx` cho `(app)`, `(learn)` và `global-error.tsx` | Đã sửa (29B) — `src/components/error-view.tsx` + `(app)/error.tsx`, `(learn)/error.tsx`, `global-error.tsx`, `not-found.tsx`: tiếng Việt, nút Thử lại / Về Tổng quan, chỉ hiện mã lỗi |
| 17 | Thấp | `shadcn` (CLI) nằm trong `dependencies` → kéo `ts-morph` / `minimatch` vào cảnh báo audit production và image Docker | `package.json` | Chuyển sang `devDependencies` | Đã sửa (29B) — `shadcn` sang `devDependencies` (giữ bản 4.23.0); audit production còn 6 mục (mục 10) |
| 18 | Thấp | Tự nâng LEARNER → MANAGER khi chỉ định trưởng phòng không huỷ phiên cũ (đặc tả: mọi lần đổi vai trò) | `src/app/(app)/org/departments/actions.ts` (`assignManager`) | Đặt `sessionsValidAfter` | **Đã sửa** |
| 19 | Thấp | Cột “Lỗi” của file trả về khi import câu hỏi ghi ô Excel không qua `safeText` (nội dung bắt đầu bằng nhãn cột cố định nên thực tế an toàn) | `src/app/(app)/content/questions/import/import-service.ts:262` | Dùng `safeText` | **Đã sửa** |
| 20 | Thấp | Hiển thị lại `changeSummary` từ DB không lọc lần 2 (đã lọc khi lưu — chỉ là phòng thủ nhiều lớp) | `version-history.tsx`, `content/courses/[id]/page.tsx` | `sanitizeLessonHtml` khi hiển thị | **Đã sửa** |

Không có phát hiện mức **Nghiêm trọng** hay **Cao**. Sau Việc 29B: mọi mục đã sửa, trừ #8 (đã sửa ở Việc 31B) và #13 (Việc 34).

---

## 13. Việc cần làm khi lên VPS

1. **`TRUST_PROXY=true`** — chỉ khi app chạy SAU Caddy và cổng app (3000) **không** mở ra Internet (người dùng không gọi thẳng được để giả `X-Forwarded-For`).
2. **`AUTH_URL=https://<tên miền>`** (và `APP_URL`) → cookie `Secure` + `__Secure-`, HSTS có tác dụng, `upgrade-insecure-requests` trong CSP.
3. **`AUTH_SECRET`** ngẫu nhiên mạnh (`npx auth secret` hoặc `openssl rand -base64 33`), khác máy dev. Đổi `AUTH_SECRET` = đăng xuất mọi người.
4. **`CRON_SECRET`** ngẫu nhiên ≥ 32 ký tự; bộ lập lịch gọi `POST /api/jobs/daily` qua HTTPS.
5. **Đổi mật khẩu mẫu** `POSTGRES_PASSWORD`, `PGADMIN_PASSWORD` (và `DATABASE_URL` tương ứng); không dùng lại giá trị trong `.env.example`.
6. **Không mở cổng database (5432) và pgAdmin (5050) ra Internet** — chỉ bind `127.0.0.1` hoặc mạng nội bộ Docker; tường lửa chỉ mở 80 / 443 (+ SSH, nên đổi cổng / chỉ dùng khoá).
7. **Bunny**: `BUNNY_STREAM_TOKEN_KEY` bật “Token authentication” trong thư viện Bunny; giới hạn tên miền được nhúng (allowed referrers).
8. **Chạy 1 tiến trình Node** (rate limit nằm trong bộ nhớ). Nhiều tiến trình / nhiều máy → chuyển kho đếm sang Postgres / Redis.
9. **Sao lưu** định kỳ database và thư mục `uploads/` (volume Docker), thử khôi phục ít nhất 1 lần.
10. `.env` trên VPS: quyền `600`, chủ là user chạy Docker; không commit.
11. Chạy `npm run check:auth` trong quy trình build / CI; theo dõi `npm audit --omit=dev` và bản vá Next.js 16.x / next-auth beta.
12. Seed: đổi ngay mật khẩu tài khoản `ADMIN` sau lần đăng nhập đầu; không seed tài khoản mẫu (NV001–NV009, CTYA-…) trên dữ liệu thật.
13. Đã xử lý các lỗi Trung bình #1, #2, #3 (Việc 29B). #8 (vé Bunny) đã sửa ở Việc 31B. Còn #13 (`TRUST_PROXY` — mục 1 ở trên, Việc 34).
