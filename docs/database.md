# Thiết kế database — E-Learning (bản gọn)

Nguồn sự thật: `prisma/schema.prisma`. File này giải thích **vì sao** thiết kế như vậy.

- PostgreSQL 17 · Prisma 6 · 15 bảng · tên bảng `snake_case` (`@@map`), tên cột `camelCase`.
- Khoá chính `cuid()`.

## 6 nhóm bảng

| Nhóm | Bảng | Ghi chú |
|---|---|---|
| 1. Tổ chức | companies, departments, positions | Công ty tổng (`parentId = NULL`) → công ty con (`parentId` = công ty tổng) → phòng ban. Chức danh dùng chung. |
| 2. Người dùng | users | Đăng nhập bằng `employeeCode` + `passwordHash` (bcrypt). Vai trò: ADMIN / EDITOR / MANAGER / LEARNER. Auth.js dùng JWT, không có bảng phiên. |
| 3. Nội dung | courses, lessons, learning_paths, learning_path_courses | Khoá học → bài học (VIDEO / DOCUMENT / QUIZ, xếp theo `sortOrder`, học tuần tự). Cài đặt bài kiểm tra nằm trong `lessons`. |
| 4. Giao khoá & tiến độ | assignment_rules, enrollments, lesson_progress | 3 nguồn: ASSIGNED, RULE, SELF. Giao lộ trình = tạo enrollment cho từng khoá, ghi `learningPathId`. |
| 5. Kiểm tra | questions, quiz_attempts | Câu hỏi thuộc bài QUIZ, đáp án là JSON. Mỗi lần làm rút ngẫu nhiên `questionCount` câu; `answers` lưu nguyên đề + câu trả lời. |
| 6. Kết quả | certificates, notifications | Chứng nhận lưu tên người và tên khoá tại thời điểm cấp; có thể có hạn. |

## Quy tắc nghiệp vụ

1. Không xoá nhân viên, khoá học: đổi `status` (INACTIVE, ARCHIVED).
2. Mỗi người – mỗi khoá chỉ 1 enrollment (`@@unique([userId, courseId])`).
3. Quy tắc giao (`assignment_rules`): điều kiện công ty / phòng ban / chức danh kết hợp kiểu VÀ, để trống = không lọc. Chạy khi tạo quy tắc, khi tạo nhân viên mới, khi nhân viên đổi phòng ban / chức danh.
4. Video hoàn thành khi `maxWatchedSeconds ≥ 90% × durationSeconds` (chống tua).
5. `progressPercent` = số bài xong ÷ tổng số bài × 100, tính lại mỗi khi một bài hoàn thành.
6. Bài QUIZ hoàn thành khi có một `quiz_attempts.passed = true`. Số lần làm ≤ `maxAttempts`.
7. Câu hỏi AI sinh ra: `isAiCreated = true`, `isApproved = false` → không được rút vào đề cho đến khi duyệt.
8. Quá hạn, tiến độ lộ trình, báo cáo: tính khi truy vấn, không lưu.
9. Thao tác ghi nhiều bảng (tạo user + giao khoá + thông báo; hoàn thành khoá + cấp chứng nhận) phải dùng `prisma.$transaction`.

## Quy trình thay đổi database

```bash
docker compose exec app npx prisma migrate dev --name mo_ta_thay_doi
```

Commit cả `prisma/schema.prisma` và thư mục `prisma/migrations/`. Không sửa tay file migration đã commit.
