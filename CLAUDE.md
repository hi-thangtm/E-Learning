# CLAUDE.md — E-Learning Tập đoàn

@AGENTS.md

Phần mềm đào tạo nội bộ cho cả tập đoàn (1 công ty tổng + nhiều công ty con, dưới 1.000 người dùng).
Phase 1 = **module Đào tạo nhân viên**. Toàn bộ giao diện tiếng Việt. **Trang học viên hỗ trợ điện thoại; trang quản trị bố cục máy tính.**

## Tài liệu bắt buộc đọc trước khi làm

| File | Nội dung |
|---|---|
| `docs/feature-spec.md` | Đặc tả chức năng, menu theo vai trò, thứ tự làm |
| `docs/database.md` | Quy tắc nghiệp vụ mà code PHẢI tuân theo (phạm vi quyền, phiên bản, giao khoá...) |
| `prisma/schema.prisma` | Nguồn sự thật của database (21 bảng) |
| `docs/design-system.md` | Quy chuẩn giao diện (tạo ở việc đầu tiên, học từ Vuexy) |

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- Tailwind CSS v4 + shadcn/ui, icon `lucide-react`
- PostgreSQL 17 (Docker) + Prisma 6 (`@prisma/client`) — KHÔNG nâng lên Prisma 7
- Auth.js v5 (`next-auth@beta`), Credentials, bcryptjs, phiên JWT
- zod để kiểm tra dữ liệu
- Video: Bunny Stream (`src/lib/bunny.ts`, vận hành: `docs/bunny-setup.md`; kiểm thử bằng Bunny giả lập `e2e/mock-bunny`) + YouTube

## Cấu trúc code

```
src/
├── auth.ts                    # Cấu hình Auth.js
├── lib/
│   ├── db.ts                  # prisma (dùng chung, KHÔNG tạo PrismaClient mới)
│   ├── current-user.ts        # getCurrentUser / requireUser / requireRole
│   └── roles.ts               # Nhãn vai trò, MENU theo vai trò, canAccess()
├── components/
│   ├── ui/                    # shadcn/ui (thêm bằng: npx shadcn@latest add <tên>)
│   ├── app-sidebar.tsx
│   └── app-header.tsx
└── app/
    ├── login/, change-password/
    └── (app)/                 # Mọi trang sau đăng nhập (có sidebar + header)
        ├── dashboard/
        ├── not-found.tsx      # Không tìm thấy (giữ sidebar) — khi page gọi notFound()
        └── <mục>/page.tsx     # Trang thật — tạo theo đường dẫn trong src/lib/roles.ts
```

Mỗi chức năng mới: `page.tsx` (server component, lấy dữ liệu) + `actions.ts` (server actions, ghi dữ liệu)
+ các component client riêng (form, dialog, bảng) đặt cùng thư mục.

## Quy tắc bắt buộc

**Bảo mật & phân quyền**
- Mọi `page.tsx` và MỌI server action đều gọi `requireUser()` hoặc `requireRole([...])` ở dòng đầu.
- Lọc dữ liệu theo phạm vi (docs/database.md — Quy tắc 1) NGAY TRONG câu truy vấn Prisma:
  `GROUP_ADMIN` thấy hết; `COMPANY_ADMIN`/`CONTENT_EDITOR` chỉ `companyId` của mình;
  `MANAGER` chỉ các phòng mình làm trưởng (`departments.managerId`) và phòng con.
- Không tin id gửi từ trình duyệt: luôn kiểm tra bản ghi đó thuộc phạm vi người đang thao tác.
- `COMPANY_ADMIN` không được gán vai trò `GROUP_ADMIN`, không được sửa người công ty khác.
- Kiểm tra mọi input bằng zod trong server action. Thông báo lỗi tiếng Việt.

**Dữ liệu**
- Không xoá dữ liệu nghiệp vụ: dùng `status = INACTIVE`, `isActive = false`, `ARCHIVED`, `CANCELLED`.
- Mọi thao tác quản trị (tạo/sửa/khoá/đặt lại mật khẩu/giao khoá...) ghi `audit_logs`
  (actorId, companyId, action viết HOA_GẠCH_DƯỚI, entityType, entityId, metadata).
- Ghi nhiều bảng cùng lúc → `prisma.$transaction`.
- Mã nhân viên (`employeeCode`) luôn lưu CHỮ IN HOA. Mật khẩu: bcrypt cost 12.
- Đổi database: sửa `prisma/schema.prisma` → `npx prisma migrate dev --name mo_ta_ngan` → cập nhật `docs/database.md`.
  KHÔNG sửa file migration đã có. KHÔNG dùng `prisma db push`.

**Giao diện**
- Giao diện mẫu: Vuexy (MUI) ở `/Users/thangtm/Desktop/vuexy-template` — CHỈ ĐỂ THAM KHẢO.
  - ĐƯỢC: học bố cục, màu, font, khoảng cách, bo góc, đổ bóng, cấu trúc trang; copy ảnh/SVG minh hoạ vào `public/`.
  - KHÔNG ĐƯỢC: cài `@mui/*`, `@emotion/*`, hay copy code component MUI. Dựng lại bằng shadcn/ui + Tailwind.
- Theo `docs/design-system.md`. Dùng biến màu của theme (`bg-primary`, `text-muted-foreground`...), không viết mã màu cứng.
- Bảng danh sách: tìm kiếm + lọc + phân trang phía server (searchParams), trạng thái rỗng, đang tải.
- Form trong dialog hoặc trang riêng; nút đang xử lý phải khoá lại (`useActionState` / pending).
- Mọi chữ hiển thị bằng tiếng Việt có dấu. Ngày giờ định dạng `dd/MM/yyyy`, múi giờ Asia/Ho_Chi_Minh.
- Thuật ngữ, chữ trên nút, định dạng số / ngày: theo `docs/design-system.md` mục 9 (dùng hàm trong `src/lib/format.ts`).
- Trang học viên hỗ trợ điện thoại (≥ 375px, lưới `grid-cols-1 sm:… lg:…`, vùng bấm ≥ 40px); trang quản trị bố cục máy tính
  (màn hình nhỏ cuộn ngang trong khung — `src/components/content-frame.tsx`, thêm đường dẫn học viên mới vào `LEARNER_PATHS`).
- Trạng thái rỗng dùng `EmptyState` / `EmptyFiltered` (`src/components/empty-state.tsx`); khung tải dùng `src/components/skeletons.tsx`;
  nút chỉ có icon: `aria-label` + `<Tooltip label>` (`src/components/ui/tooltip.tsx`).

## Kiểm tra trước khi báo xong

```bash
npx tsc --noEmit     # không lỗi kiểu
npm run lint         # không lỗi lint
npm run build        # build production chạy được
npm run test:e2e     # kiểm thử toàn luồng Playwright (database elearning_test) — phải xanh hết; xem docs/test-scenarios.md
```

Báo lại: đã làm gì, file nào thay đổi, cách tự kiểm tra trên trình duyệt (tài khoản nào, bấm gì).

## Cách làm việc

- Mỗi lần chỉ làm MỘT việc được giao; không tự làm sang chức năng khác.
- Chưa rõ nghiệp vụ → hỏi lại, không tự đoán.
- Không chạy lệnh git (người dùng tự commit/push).
- Không sửa `docker-compose.yml`, `Dockerfile`, `.env` trừ khi được yêu cầu.
