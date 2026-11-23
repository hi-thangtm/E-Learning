# Hiệu năng với dữ liệu lớn (Việc 30)

Mục tiêu: chạy tốt với ~1.000 người sau 1 năm sử dụng, trên VPS 2GB RAM (app + Postgres + Caddy cùng một máy).

| Chỉ tiêu | Mục tiêu |
|---|---|
| Trang học viên (p95) | < 1 giây |
| Trang quản lý (p95) | < 2 giây |
| Xuất toàn bộ báo cáo | < 10 giây |
| Tác vụ hằng ngày | < 2 phút |
| Bộ nhớ | app ≤ 1GB, Postgres ≤ 512MB |
| Số truy vấn | ≤ 30 / trang |

## Kết luận

**Mọi chỉ tiêu đều đạt ngay từ lượt đo đầu, với biên rộng** (trang chậm nhất p95 ≈ 0,3 giây, xuất toàn bộ < 1 giây, tác vụ hằng ngày ≈ 2 giây,
app < 200 MiB, Postgres ≈ 210 MiB, nhiều nhất 23–26 truy vấn / trang). Chỉ thêm 1 index để giảm các truy vấn nặng nhất
(báo cáo Theo người, Dashboard tập đoàn, 20 học viên đồng thời); số liệu báo cáo không đổi (ảnh chụp trước / sau GIỐNG HỆT).

Lưu ý: máy đo (Apple Silicon) nhanh hơn 1 vCPU VPS phổ thông; dù chậm gấp 3 lần thì các trang vẫn dưới mục tiêu.

## Cấu hình đo

| Thành phần | Cấu hình |
|---|---|
| Máy | MacBook (Apple Silicon), Docker Desktop 8 CPU / 8GB — **giới hạn từng container** như dưới |
| App | Image production (`Dockerfile` target `runner`, Next.js 16.4.6 standalone), `mem_limit: 1g`, `cpus: 1`, cổng 3100 |
| Postgres 17 | `mem_limit: 512m`, `cpus: 1`, `shared_buffers=128MB`, `effective_cache_size=384MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`, `max_connections=30`, `random_page_cost=1.1` (giải thích trong `docker-compose.perf.yml`) |
| Dữ liệu | `elearning_perf`, `npm run perf:seed -- --scale 1 --anchor 2026-11-23` (seed 2026, tất định) |
| Cách đo | `scripts/bench-pages.ts`: HTTP thật, đăng nhập Auth.js, 1 lần làm nóng + 5 lần đo / trang → trung vị, p95 (5 mẫu → p95 = mẫu lớn nhất) |

## Số dòng (scale 1)

| Bảng | Số dòng | | Bảng | Số dòng |
|---|---:|---|---|---:|
| lesson_progress | 226.474 | | users | 1.000 |
| notifications | 150.000 | | lessons | 682 |
| quiz_attempts | 50.696 | | course_sections | 183 |
| audit_logs | 30.000 | | course_versions | 81 (15 khoá nhiều phiên bản) |
| enrollments | 28.095 (10,4% quá hạn) | | departments | 60 (3 cấp) |
| certificates | 13.338 | | courses | 50 (40 PUBLISHED / 5 DRAFT / 5 ARCHIVED) |
| course_reviews | 5.935 | | learning_paths / assignment_rules | 10 / 20 |
| questions | 1.500 | | companies | 5 |

Kiểm tra bất biến khi sinh (đều = 0): COMPLETED ⇒ 100%; `completedVersion ≤ acknowledgedVersion ≤ currentVersion`; không có lượt học khoá
công ty con của người công ty khác / khoá DRAFT; `progressPercent` = bài xong ÷ tổng bài; chứng nhận / đánh giá chỉ của người từng hoàn thành;
không vượt `maxAttempts`; quy tắc công ty con chỉ nhắm chính công ty đó. Sinh xong ≈ 36–48 giây.
PERF-MG1 quản lý 160 người (cây 1 phòng + 4 nhóm + tổ), PERF-LN1 có 36 lượt học, ~690 thông báo.

## Kết quả từng trang (scale 1) — mili giây

“Trước” = trước Việc 30; “Sau” = có index `lesson_progress[userId, updatedAt]`. Số truy vấn đã trừ 2 truy vấn của chính route đếm.

| Nhóm | Trang | Trung vị trước | p95 trước | Trung vị sau | p95 sau | Truy vấn trước → sau |
|---|---|---:|---:|---:|---:|---:|
| Học viên (LN1) | /dashboard | 19 | 58 | 37 | 97 | 26 → 23 |
| | /my-courses | 59 | 90 | 77 | 93 | 23 → 23 |
| | /my-courses/[id] | 12 | 38 | 14 | 42 | 15 → 15 |
| | /learn/[khoá]/[bài] | 9 | 41 | 10 | 19 | 14 → 14 |
| | /notifications | 11 | 39 | 11 | 28 | 10 → 10 |
| | /certificates | 9 | 37 | 13 | 52 | 6 → 5 |
| | /library | 12 | 36 | 14 | 96 | 13 → 14 |
| Trưởng phòng (MG1) | /team | 17 | 19 | 20 | 45 | 12 → 12 |
| | /team/members (lọc quá hạn, sắp xếp) | 17 | 45 | 28 | 42 | 11 → 11 |
| | /team/members/[id] | 15 | 19 | 29 | 95 | 18 → 18 |
| | /reports 5 tab | 16–42 | 19–74 | 17–63 | 19–73 | 14–16 |
| Admin công ty (CA1) | /reports courses / departments / members | 58 / 45 / 142 | 140 / 130 / 205 | 58 / 131 / 157 | 62 / 159 / 250 | 12–14 |
| | /reports versions / certificates | 28 / 18 | 30 / 23 | 24 / 29 | 27 / 99 | 12 |
| | /org/users · /system/audit-logs · /assign/manual · /content/courses | 13 · 12 · 26 · 15 | 37 · 53 · 61 · 37 | 17 · 11 · 23 · 15 | 38 · 24 · 25 · 16 | 15 · 15 · 18 · 12 |
| Admin tập đoàn (GA) | /reports courses (toàn tập đoàn) | 265 | 296 | 273 | 334 | 13 |
| | /reports departments | 247 | 269 | 273 | 288 | 13 |
| | /reports members | 329 | **378** | 283 | **299** | 15 |
| | /reports versions / certificates | 35 / 44 | 38 / 91 | 33 / 37 | 40 / 39 | 13 |
| | /reports 5 tab lọc 1 công ty (CTY1) | 18–140 | 19–180 | 19–134 | 23–161 | 14–16 |
| | /system/overview | 93 | **145** | 73 | **88** | 20 |
| | /org/users · /system/audit-logs · /assign/manual · /content/courses | 16 · 11 · 26 · 21 | 33 · 11 · 27 · 33 | 14 · 11 · 22 · 15 | 15 · 13 · 23 · 23 | 15 · 16 · 18 · 13 |

Dao động ±30–60 ms giữa các lượt (VD p95 của /library, /team/members/[id]) là nhiễu đo với 5 mẫu trên 1 CPU, không phải thay đổi mã.

### Xuất Excel (Admin tập đoàn, toàn tập đoàn)

| File | Trước | Sau | Dung lượng |
|---|---:|---:|---:|
| /reports/export tab courses / departments / members / versions / certificates | 167 / 78 / 246 / 41 / 58 ms | 164 / 94 / 229 / 35 / 65 ms | 11 / 9 / 70 / 8 / 20 KB |
| **Xuất toàn bộ** (`tab=all`, 3 lần) | trung vị 547, max 1.000 ms | trung vị 549, max **647 ms** | 97 KB |
| /team/members/export (MG1) | 95 ms | 27 ms | 16 KB |
| /system/audit-logs/export | 532 ms | 363 ms | 111 KB |

### 20 học viên đồng thời (PERF-LN1…LN20, 3 vòng: /dashboard rồi /learn/…)

| Trang | Trung vị trước | p95 trước | Trung vị sau | p95 sau |
|---|---:|---:|---:|---:|
| /dashboard | 492 | **693** | 308 | **449** |
| /learn/… | 273 | 314 | 282 | 325 |

### Tác vụ hằng ngày (`runDailyJob` trên elearning_perf)

Trước 1,5 giây · Sau 2,2 giây (mục tiêu < 120 giây). Một lượt: 174 nhắc sắp đến hạn, 19 bài kiểm tra bỏ dở được chấm,
~200 nhắc chứng nhận sắp hết hạn, 3 lượt học lại do chứng nhận hết hạn, 545 nhắc xác nhận bản MINOR quá hạn.

### Bộ nhớ cao nhất (MiB, `docker stats` mỗi giây)

| Giai đoạn | App trước | DB trước | App sau | DB sau |
|---|---:|---:|---:|---:|
| Nghỉ | 71 | 161 | 75 | 173 |
| Đồng thời 20 học viên | 180 | 193 | — | — |
| Xuất toàn bộ | 185 | 193 | 182 | 210 |
| Tác vụ hằng ngày | 175 | 196 | 186 | 206 |
| **Cao nhất** | **185 / 1.024** | **196 / 512** | **186 / 1.024** | **210 / 512** |

## Thay đổi đã làm + lý do

1. **Index `lesson_progress[userId, updatedAt]`** (migration `perf_indexes`). `EXPLAIN (ANALYZE, BUFFERS)` trên 226k dòng:
   - “Lần học gần nhất” (`SELECT "userId", MAX("updatedAt") … WHERE "userId" = ANY(…) GROUP BY` — báo cáo Theo người): Parallel Seq Scan 84 ms → Index Only Scan **25 ms**.
   - “Người học 30 ngày qua” (Dashboard tập đoàn): 48 ms → **25 ms** (planner dùng chính index này theo từng người).
   - Kéo theo “Tiếp tục học” ở /dashboard (bài dở mới nhất của 1 người).
2. **`getContinueLearning` thêm tiêu chí phụ `id`** khi sắp theo `updatedAt`: khi 2 bài trùng thời điểm, thứ tự trước đây phụ thuộc kế hoạch truy vấn
   (index mới làm đảo thứ tự 2 dòng trùng giờ trong dữ liệu đo). Không đổi nghiệp vụ, chỉ làm kết quả xác định.
3. **Công cụ** (không ảnh hưởng chạy thật): `PERF_LOG_QUERIES` + `/api/perf/queries` (tắt mặc định → route 404, không đăng ký sự kiện),
   database đo + seed + bộ đo + ảnh chụp số liệu (`scripts/perf/*`, `scripts/seed-perf.ts`, `scripts/bench-pages.ts`, `scripts/perf-snapshot.ts`).

Index ứng viên **không thêm** (truy vấn đã < 15 ms hoặc planner không dùng): `lesson_progress[updatedAt]`, `notifications[userId, createdAt]`,
`notifications[createdAt]`, `enrollments[userId, status]`, `certificates[userId, courseId, issuedAt]`, `quiz_attempts[userId, lessonId]`.

**Số liệu không đổi**: `perf-snapshot` chụp kết quả 11 nhóm (5 báo cáo × 6 phạm vi / bộ lọc + chi tiết khoá, Dashboard tập đoàn, Đội của tôi ×3,
dashboard học viên) trên cùng dữ liệu, không index vs có index → **GIỐNG HỆT** (5.656.319 ký tự JSON).

## Còn chậm nhất + đề xuất (không bắt buộc ở quy mô hiện tại)

| Chỗ | Hiện tại | Nguyên nhân | Đề xuất khi dữ liệu lớn hơn nhiều |
|---|---|---|---|
| /reports tab Khoá học / Phòng ban / Theo người của Admin tập đoàn (toàn tập đoàn) | p95 0,29–0,33 s | Gộp ~28k lượt học × 1.000 người (`userId = ANY(1000 id)`), quét cả bảng `enrollments` | Bảng tổng hợp theo ngày (materialized view làm mới bởi tác vụ hằng ngày) hoặc cache 5 phút theo bộ lọc |
| 20 học viên mở /dashboard cùng lúc | p95 0,45 s | 23 truy vấn nhỏ / trang, 1 CPU cho app | Đủ dùng; nếu cần: gộp các truy vấn đếm của `getMyStats` / `getMyEnrollmentCounts` |
| /my-courses (HTML 261 KB) | p95 ~0,09 s | 36 thẻ khoá + mục lục để tính bài tiếp theo | Phân trang / tải lười thẻ khi người có > 50 lượt học |
| Giới hạn đăng nhập 10/phút/IP khi `TRUST_PROXY` tắt | — | Mọi request chung khoá “untrusted” (Việc 29A #13) | Bật `TRUST_PROXY=true` sau Caddy (Việc 34) |

## Scale 2 (chỉ đo, không bắt buộc đạt)

`npm run perf:seed -- --scale 2 --anchor 2026-11-23` (sinh 204 giây, bất biến đều = 0): 2.000 người, 100 khoá, 120 phòng ban — mỗi người thấy
gấp đôi số khoá nên dữ liệu học **≈ 4 lần** scale 1: 119.785 lượt học (9,5% quá hạn), **1.098.803** tiến độ bài, 419.597 thông báo,
252.644 lượt làm bài, 57.647 chứng nhận, 25.818 đánh giá, 60.000 nhật ký. Đo trên image “sau” (có index); app đang bật đếm truy vấn
(`PERF_LOG_QUERIES=true`, chi phí chỉ là tăng 1 biến đếm / truy vấn).

| Nhóm | Trang | Trung vị | p95 |
|---|---|---:|---:|
| Học viên (74 lượt học) | /dashboard · /my-courses · /my-courses/[id] · /learn · /notifications · /certificates · /library | 23 · 48 · 12 · 10 · 11 · 20 · 11 | 69 · 124 · 36 · 11 · 11 · 74 · 30 |
| Trưởng phòng (218 người) | /team · /team/members · /team/members/[id] | 20 · 20 · 31 | 22 · 22 · 76 |
| | /reports courses · departments · members · versions · certificates | 161 · 134 · 167 · 20 · 25 | 412 · 142 · 237 · 23 · 43 |
| Admin công ty | /reports courses · departments · members | 205 · 254 · 749 | 865 · 658 · 792 |
| Admin tập đoàn, toàn tập đoàn | /reports courses · departments · members | 2.267 · 2.111 · 2.306 | **2.299 · 2.119 · 2.400** |
| | /reports versions · certificates | 69 · 104 | 101 · 117 |
| Admin tập đoàn, lọc CTY1 | /reports courses · departments · members | 227 · 633 · 729 | 650 · 641 · 734 |
| | /system/overview | 304 | 353 |
| | /org/users · /system/audit-logs · /assign/manual · /content/courses | 14 · 11 · 39 · 24 | 15 · 43 · 50 · 26 |
| Xuất | tab courses / departments / members / versions / certificates | 724 / 529 / 1.046 / 71 / 302 ms | |
| | **Xuất toàn bộ** | trung vị 2.286 ms | max **4.014 ms** (263 KB) |
| | /team/members/export · /system/audit-logs/export | 30 · 525 ms | |
| Đồng thời 20 học viên | /dashboard · /learn/… | 376 · 312 | **869** · 408 |
| Tác vụ hằng ngày | | **9,6 giây** | (921 sắp hạn, 1.922 chứng nhận sắp hết hạn, 39 học lại, 3.073 nhắc MINOR) |
| Bộ nhớ cao nhất | app / db | 211 / 262 MiB | |

**Nhận xét**: ở quy mô ≈ 4 lần, chỉ 3 tab báo cáo **toàn tập đoàn** của Admin tập đoàn (gộp 120k lượt học của 2.000 người trong 1 request)
vượt nhẹ 2 giây; mọi trang khác, xuất toàn bộ (< 10 giây), tác vụ (< 2 phút), bộ nhớ vẫn đạt. Khi dữ liệu thật tiến tới mức này, áp dụng
đề xuất ở bảng “Còn chậm nhất” (bảng tổng hợp làm mới bởi tác vụ hằng ngày / cache theo bộ lọc); trước mắt có thể lọc theo công ty (~0,7 giây).

Sau khi đo, database đo được sinh lại về scale 1 (`--anchor 2026-11-23`) và container `db` trả về cấu hình thường (`docker compose up -d`).

---

## Cách chạy lại toàn bộ phép đo

```bash
# 1. Database đo riêng (elearning_perf, cùng container Postgres) — chỉ cần làm 1 lần
npm run perf:env                     # tạo .env.perf từ .env (đổi tên database → elearning_perf)
npm run perf:db                      # CREATE DATABASE elearning_perf + prisma migrate deploy

# 2. Sinh dữ liệu (xoá sạch dữ liệu cũ của elearning_perf). Cùng --anchor → đúng bộ dữ liệu (kể cả id)
npm run perf:seed -- --scale 1 --anchor 2026-11-23

# 3. App + Postgres giới hạn bộ nhớ giống VPS (app cổng 3100, database elearning_perf)
docker compose -f docker-compose.yml -f docker-compose.perf.yml --profile app up -d --build

# 4. Đo trang (đăng nhập PERF-*, 1 lần làm nóng + 5 lần đo, xuất Excel, 20 học viên đồng thời, tác vụ hằng ngày, docker stats)
npm run perf:bench -- --label after
#    Đếm truy vấn mỗi trang: bật cờ cho app rồi chạy chế độ --queries
PERF_LOG_QUERIES=true docker compose -f docker-compose.yml -f docker-compose.perf.yml --profile app up -d app
npm run perf:bench -- --label after --queries --only learner,manager,admin

# 5. Kiểm tra số liệu không đổi (sinh lại dữ liệu cùng --anchor trước mỗi lần chụp)
npm run perf:seed -- --scale 1 --anchor 2026-11-23
npm run perf:snapshot -- --out perf-results/after.json --anchor 2026-11-23
npm run perf:snapshot -- --compare perf-results/before.json perf-results/after.json

# Chỉ đo tác vụ hằng ngày
npm run perf:job

# 6. Đo xong: trả container db về cấu hình thường (không giới hạn bộ nhớ) + tắt app đo
docker compose -f docker-compose.yml -f docker-compose.perf.yml --profile app stop app
docker compose up -d
```

- Mọi script `perf:*` đọc `DATABASE_URL` từ `.env.perf` và **từ chối chạy** nếu tên database không phải `elearning_perf`.
- Tài khoản thử tay (mật khẩu `Perf12345`), mở `http://localhost:3100`: `PERF-GA` (Admin tập đoàn), `PERF-CA1` (Admin công ty con lớn nhất),
  `PERF-MG1` (trưởng phòng có phòng con), `PERF-CE1` (biên soạn), `PERF-LN1` (học viên nhiều lượt học / thông báo), `PERF-LN2…LN20`.
- Kết quả đo, phiên đăng nhập, ảnh chụp số liệu nằm ở `perf-results/` (không commit).
- `scripts/bench-reports.ts` (Việc 27) vẫn dùng được để đo riêng các hàm báo cáo trong transaction rollback trên database phát triển.

## Xoá database đo

```bash
npm run perf:db:drop                 # DROP DATABASE elearning_perf (ngắt kết nối còn mở trước)
docker compose -f docker-compose.yml -f docker-compose.perf.yml --profile app down   # nếu muốn bỏ hẳn container app đo
docker compose up -d                 # trả container db về cấu hình thường
rm -rf perf-results .env.perf        # tuỳ chọn
```
