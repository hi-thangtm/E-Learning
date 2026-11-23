# Quy chuẩn giao diện (Design System)

Giao diện học theo **Vuexy (MUI, vertical layout, light mode)** ở `/Users/thangtm/Desktop/vuexy-template`,
nhưng dựng lại bằng **Tailwind CSS v4 + shadcn/ui**. Các số liệu dưới đây lấy trực tiếp từ mã nguồn Vuexy
(đường dẫn ghi trong ngoặc) để trang của mình nhìn giống mẫu.

## 0. Nguyên tắc

- Vuexy **chỉ để tham khảo**: học bố cục, màu, chữ, khoảng cách. **Không** cài `@mui/*`, `@emotion/*`, không copy code component MUI.
- Được copy ảnh/SVG minh hoạ của Vuexy vào `public/`.
- **Không viết mã màu cứng** trong component. Luôn dùng biến theme: `bg-primary`, `text-muted-foreground`, `bg-success/16`…
  Mã màu chỉ được khai báo ở `src/app/globals.css`.
- Layout desktop, toàn bộ chữ tiếng Việt có dấu, ngày giờ `dd/MM/yyyy`.
- Icon: `lucide-react` (Vuexy dùng Tabler icon, chọn icon lucide có hình tương đương).

---

## 1. Bảng màu

Nguồn: `src/@core/theme/colorSchemes.ts`. Chữ, viền và nền mờ của Vuexy là màu `rgb(47 43 61)` với các độ mờ khác nhau;
bảng dưới đã quy đổi ra mã hex trên nền trắng.

### 1.1 Màu chính và màu trạng thái

| Vai trò | Main | Light | Dark | Lớp Tailwind | Dùng cho |
|---|---|---|---|---|---|
| Primary | `#7367F0` | `#8F85F3` | `#675DD8` | `bg-primary`, `text-primary` | Nút chính, menu đang chọn, liên kết, focus |
| Secondary | `#808390` | `#999CA6` | `#737682` | `text-secondary-foreground`, `bg-secondary` | Nút phụ, trạng thái trung tính |
| Success | `#28C76F` | `#53D28C` | `#24B364` | `bg-success`, `text-success` | Hoạt động, hoàn thành, đạt |
| Warning | `#FF9F43` | `#FFB269` | `#E68F3C` | `bg-warning`, `text-warning` | Chờ xử lý, sắp đến hạn |
| Error | `#FF4C51` | `#FF7074` | `#E64449` | `bg-destructive`, `text-destructive` | Lỗi, quá hạn, khoá, xoá |
| Info | `#00BAD1` | `#33C8DA` | `#00A7BC` | `bg-info`, `text-info` | Thông tin, lưu trữ |

Chữ trên nền màu đậm: `#FFFFFF` (`text-primary-foreground`, `text-success-foreground`…).

**Kiểu "tonal" (nền nhạt + chữ màu)** dùng rất nhiều trong Vuexy (badge, avatar icon, nút phụ):
nền = màu main với độ mờ **16%**, chữ = màu main. Trong Tailwind: `bg-success/16 text-success`.
Hover nền nhạt hơn dùng 8% (`bg-primary/8`).

### 1.2 Nền, chữ, viền

| Token | Mã màu | Biến CSS / lớp | Ghi chú Vuexy |
|---|---|---|---|
| Nền trang | `#F8F7FA` | `--background` / `bg-background` | `background.default` |
| Nền card, popover, sidebar | `#FFFFFF` | `--card` / `bg-card` | `background.paper` |
| Chữ chính | `#444050` | `--foreground` / `text-foreground` | `text.primary` (rgb 47 43 61 / 0.9) |
| Chữ phụ | `#6D6B77` | `--muted-foreground` / `text-muted-foreground` | `text.secondary` (/ 0.7) |
| Chữ mờ, vô hiệu | `#ACAAB1` | `text-foreground/45` | `text.disabled` (/ 0.4) |
| Viền, đường kẻ | `#E6E6E8` | `--border` / `border-border` | `divider` (/ 0.12) |
| Viền ô nhập | `#D1D0D4` | `--input` / `border-input` | `customColors.inputBorder` (/ 0.22) |
| Nền hover | `#F3F2F3` | `--muted`, `--accent` / `bg-muted` | `action.hover` (/ 0.06) |
| Nền nút secondary tonal | `#EBEBED` | `--secondary` / `bg-secondary` | secondary / 0.16 |
| Nền avatar mặc định | `#EEEDF0` | dùng `bg-muted` | `Avatar.defaultBg` |
| Nền tooltip | `#2F2B3D` | (shadcn tooltip dùng `bg-foreground`) | `Tooltip.bg` |

Chế độ tối (chưa dùng ở phase 1, đã khai báo sẵn trong `.dark`): nền `#25293C`, card `#2F3349`,
chữ `#CFCDE4`, chữ phụ `#ACABC1`, viền `#44485E`.

### 1.3 Màu biểu đồ

`--chart-1` → `--chart-5` lần lượt là primary, info, success, warning, error.

---

## 2. Chữ

- **Font: Be Vietnam Pro** (`src/app/layout.tsx`, các độ đậm 400/500/600/700).
  Vuexy dùng Public Sans, nhưng font đó không có đủ dấu tiếng Việt nên **không dùng**.
- Cỡ chữ cơ sở của Vuexy: **15px** cho nội dung chính, **13px** cho nội dung phụ.
- Tiêu đề Vuexy đều đậm **500** (`font-medium`). Không dùng `font-bold` cho tiêu đề trang.

Nguồn: `src/@core/theme/typography.ts`

| Cấp | Cỡ | Line-height | Đậm | Lớp Tailwind | Dùng cho |
|---|---|---|---|---|---|
| h1 | 46px | 1.48 | 500 | `text-[46px] leading-[1.48] font-medium` | Hiếm dùng |
| h2 | 38px | 1.47 | 500 | `text-[38px] leading-[1.47] font-medium` | Hiếm dùng |
| h3 | 28px | 1.5 | 500 | `text-[28px] leading-normal font-medium` | Số liệu lớn |
| h4 | 24px | 1.58 | 500 | `text-2xl font-medium` | **Tiêu đề trang**, số trên thẻ số liệu |
| h5 | 18px | 1.56 | 500 | `text-lg font-medium` | **Tiêu đề card, tiêu đề dialog** |
| h6 | 15px | 1.47 | 500 | `text-[15px] font-medium` | Tiêu đề nhỏ, tên trong bảng |
| body1 | 15px | 1.47 | 400 | `text-[15px]` | Nội dung chính, ô bảng |
| body2 | 13px | 1.54 | 400 | `text-[13px]` | Mô tả, chú thích, phụ đề card |
| button | 15px | 1.47 | 500 | `text-[15px] font-medium` | Chữ trên nút, **không viết hoa** |
| caption | 13px | 1.38 | 400 | `text-[13px] tracking-[0.4px]` | Ghi chú dưới ô nhập |
| overline | 12px | 1.17 | 400 | `text-xs uppercase tracking-[0.8px]` | Nhãn nhỏ viết hoa |

Màu chữ: tiêu đề `text-foreground`, nội dung và mô tả `text-muted-foreground`.

---

## 3. Khoảng cách, bo góc, đổ bóng

### 3.1 Khoảng cách

- Đơn vị Vuexy: **1 = 4px**, trùng thang Tailwind (`p-6` = 24px). Nguồn `src/@core/theme/spacing.ts`.
- Padding vùng nội dung, header, footer: **24px** (`themeConfig.layoutPadding`).
- Khoảng cách giữa các card trong lưới: **24px** (`gap-6`).
- Padding trong card: **24px** (`p-6`). Phần nối tiếp header không có padding trên (`pt-0`).
- Khoảng cách giữa các nút cạnh nhau: **16px** (`gap-4`). Giữa các ô trong form: `gap-4` đến `gap-6`.

### 3.2 Bo góc

Nguồn: `src/@core/theme/index.ts` (`shape.borderRadius = 6`, `customBorderRadius`).

| Vuexy | px | Tailwind (đã cấu hình) | Dùng cho |
|---|---|---|---|
| xs | 2px | `rounded-xs` | Thanh tiến độ |
| sm | 4px | `rounded-sm` | Badge nhỏ |
| md (mặc định) | 6px | `rounded-md`, `rounded-lg` | **Nút, ô nhập, mục menu, card** |
| lg | 8px | `rounded-xl` | **Dialog**, card của shadcn |
| xl | 10px | `rounded-2xl` | Hiếm dùng |

Lưu ý: nút và ô nhập của shadcn dùng `rounded-lg`, nên `--radius-lg` được đặt bằng 6px cho giống Vuexy.

### 3.3 Đổ bóng

Nguồn: `src/@core/theme/customShadows.ts`. Đã khai báo trong `globals.css`.

| Lớp | Giá trị | Dùng cho |
|---|---|---|
| `shadow-xs` | `0 1px 6px rgb(47 43 61 / .10)` | Ô nhỏ |
| `shadow-sm` | `0 2px 8px rgb(47 43 61 / .12)` | Header nổi |
| `shadow-md` | `0 3px 12px rgb(47 43 61 / .14)` | **Card** |
| `shadow-lg` | `0 4px 18px rgb(47 43 61 / .16)` | **Dialog**, menu thả xuống |
| `shadow-xl` | `0 5px 30px rgb(47 43 61 / .18)` | Popup lớn |
| `shadow-primary-sm` | `0 2px 6px rgb(115 103 240 / .30)` | **Nút primary**, mục menu đang chọn |
| `shadow-primary-md` | `0 4px 16px rgb(115 103 240 / .40)` | Hover nút primary |

### 3.4 Thông số từng thành phần

**Card** (`overrides/card.ts`)
- Nền trắng, bo 6px, `shadow-md`, **không viền**.
- Header: padding 24px, tiêu đề h5, phụ đề 15px màu chữ phụ. Nút hành động góc phải.
- Content: padding 24px, chữ màu phụ.

**Nút** (`overrides/button.ts`)

| Kích thước | Padding (contained) | Cao | Cỡ icon |
|---|---|---|---|
| Nhỏ | 6px 14px | ~30px | 14px |
| Vừa (mặc định) | 8px 20px | ~38px | 16px |
| Lớn | 11px 26px | ~48px | 20px |

- Primary: nền `primary`, chữ trắng, `shadow-primary-sm`. Bấm thì nền `#675DD8` (primary dark).
- Tonal (phụ): `bg-secondary text-secondary-foreground` hoặc `bg-primary/16 text-primary`, không bóng.
- Outline: viền theo màu, nền trong suốt, hover nền màu 8%.
- Vô hiệu: `opacity-45`. Khi bấm: `active:scale-[0.98]`.
- Chữ không viết hoa, đậm 500. Icon đứng trước chữ, cách 8px.

**Ô nhập** (`overrides/input.ts`, `CustomTextField`)
- Nhãn đặt **phía trên** ô (13px, chữ chính), cách ô 4px.
- Cao ~38px, padding ngang 14px, chữ 15px, bo 6px, viền `border-input`.
- Hover: viền đậm hơn. Focus: viền `primary` + `shadow-primary-sm`.
- Lỗi: viền `destructive`, chữ báo lỗi 13px màu `destructive` bên dưới.
- Placeholder: màu chữ mờ.

**Dialog** (`overrides/dialog.ts`)
- Bo 8px (`rounded-xl`), `shadow-lg`.
- Tiêu đề h5, padding 24px. Nội dung padding 24px. Hàng nút padding 24px, các nút cách nhau 16px.
- **Không bao giờ cao hơn màn hình**: `DialogContent` cao tối đa `calc(100dvh - 4rem)`, bố cục cột
  **header (cố định) – `DialogBody` (cuộn) – footer (cố định)**. Nút Huỷ / Lưu luôn nhìn thấy, chỉ phần thân cuộn. Chi tiết ở mục 5.3.

---

## 4. Layout (vertical)

Nguồn: `src/configs/themeConfig.ts`, `src/@menu/components/vertical-menu/VerticalNav.tsx`,
`src/@core/styles/vertical/menuItemStyles.ts`, `src/app/globals.css` của Vuexy.

### 4.1 Sidebar

| Thông số | Giá trị |
|---|---|
| Rộng | **260px** (thu gọn: 71px) |
| Nền | `bg-sidebar` (trắng), không viền, bóng nhẹ |
| Khu logo | cao ~64px, padding 20px 22px 20px 16px |
| Lề trong danh sách menu | padding ngang 16px |
| Mục menu | padding **8px 12px** (cao ~38px), bo 6px, cách nhau 6px |
| Icon mục cấp 1 | 22px, cách chữ 8px |
| Chữ mục menu | 15px, màu chữ chính |
| Hover | nền `bg-muted` |
| **Mục đang chọn** | nền gradient `from-primary/70 to-primary` (từ phải sang trái), chữ + icon trắng, `shadow-primary-sm` |
| Tiêu đề nhóm | 13px viết hoa, `tracking-[0.4px]`, màu chữ mờ (`text-foreground/45`), padding 6px 12px, cách nhóm trên 14px |

Gradient mục đang chọn trong Tailwind: `bg-linear-to-l from-primary/70 to-primary text-primary-foreground shadow-primary-sm`.

### 4.2 Header

| Thông số | Giá trị |
|---|---|
| Cao | **54px** (vùng chứa 64px, có khoảng hở phía trên) |
| Kiểu | **Nổi**: tách khỏi mép, bo 6px, nền trắng, `shadow-sm`, dính trên cùng khi cuộn (có hiệu ứng mờ nền) |
| Rộng | bằng vùng nội dung (tối đa 1440px) |
| Padding ngang | 24px |
| Bên trái | nút thu gọn sidebar, ô tìm kiếm |
| Bên phải | chuông thông báo, avatar người dùng (menu thả xuống) |

### 4.3 Vùng nội dung

- Nền trang `bg-background` (`#F8F7FA`).
- Rộng tối đa **1440px**, căn giữa (`mx-auto max-w-[1440px]`), padding **24px** (`p-6`; điện thoại 16px `p-4`).
- Tiêu đề trang: h4, cách nội dung bên dưới 24px. Có thể kèm mô tả body1 màu chữ phụ.
- Footer: tĩnh, cùng độ rộng, chữ 13px màu phụ.

### 4.4 Màn hình nhỏ — trang học viên hỗ trợ điện thoại; trang quản trị bố cục máy tính

| Thành phần | < 1024px (`lg`) | Ghi chú |
|---|---|---|
| Sidebar | Ẩn; nút ☰ ở header mở `MobileSidebar` (Sheet trượt từ trái, rộng 280px, tự đóng khi chuyển trang) | `app-sidebar.tsx` |
| Header | Padding 8–16px; breadcrumb chỉ còn tên trang (< 640px); ô tìm nhanh ẩn (< 768px) | `app-header.tsx` |
| Trang học viên | Co giãn ≥ 375px: `/dashboard`, `/my-courses…`, `/learning-paths…`, `/library…`, `/certificates`, `/notifications`, `/learn/…`, đăng nhập, đổi mật khẩu, `/verify` | `LEARNER_PATHS` trong `content-frame.tsx` |
| Trang quản trị | Giữ bố cục máy tính: nội dung rộng tối thiểu 900px, cuộn ngang trong khung (không vỡ trang) | `ContentFrame` |
| Trang học | Mục lục thành Sheet trượt từ phải; nút “Bài trước / Bài tiếp theo” chia đôi chiều ngang, cao 44px; đáp án bài kiểm tra ≥ 44px | `lesson-shell.tsx`, `quiz-player.tsx` |

Quy ước khi viết trang học viên: lưới `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (không dùng `grid-cols-N` cố định),
padding thẻ `p-4 sm:p-6`, vùng bấm ≥ 40px (`h-10 sm:h-8`…), ô chữ dài trong lưới cần `min-w-0` / `grid-cols-1` để `truncate` có tác dụng,
ảnh / video / PDF `w-full`. Kiểm bằng `e2e/11-dien-thoai.spec.ts` (không cuộn ngang ở 375px).

---

## 5. Mẫu thành phần

Đoạn mã dưới đây là **mẫu hướng dẫn**, chưa phải component có sẵn. Khi làm chức năng, tạo component tương ứng
trong `src/components/` (dùng chung) và dùng lại.

### 5.1 Thẻ số liệu

Theo `src/components/card-statistics/HorizontalWithSubtitle.tsx`, dùng ở `views/apps/user/list/UserListCards.tsx`.
Lưới 4 cột, cách nhau 24px. Mỗi thẻ: bên trái tiêu đề, số lớn (h4) kèm xu hướng, mô tả; bên phải ô icon vuông tonal 42px.

```tsx
<div className="grid grid-cols-4 gap-6">
  <Card className="flex-row items-start justify-between gap-1 p-6">
    <div className="flex flex-col gap-1">
      <p className="text-[15px] text-foreground">Đang học</p>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-medium text-foreground">12</span>
        <span className="text-[15px] text-success">(+29%)</span>
      </div>
      <p className="text-[13px] text-muted-foreground">Khoá học đang tham gia</p>
    </div>
    <div className="flex size-[42px] items-center justify-center rounded-md bg-primary/16 text-primary">
      <BookOpen className="size-[26px]" />
    </div>
  </Card>
</div>
```

Màu ô icon theo ý nghĩa: đang học = primary, hoàn thành = success, quá hạn = destructive, chứng nhận = warning.

### 5.2 Bảng danh sách (tìm kiếm + lọc + phân trang)

Theo `views/apps/user/list/` (`UserListTable.tsx`, `TableFilters.tsx`) và `src/@core/styles/table.module.css`.
Cả bảng nằm trong **một card**:

```
┌ Card ─────────────────────────────────────────────────────────────┐
│ Bộ lọc (h5)                                                        │
│ [Vai trò ▾]        [Phòng ban ▾]        [Trạng thái ▾]   (lưới 3 cột) │
├────────────────────────────────────────────────────────────────────┤
│ [10 ▾]                    [🔍 Tìm kiếm...] [⇪ Xuất Excel] [+ Thêm]  │
├────────────────────────────────────────────────────────────────────┤
│ MÃ NV   HỌ TÊN           PHÒNG BAN   VAI TRÒ   TRẠNG THÁI   THAO TÁC │
│ ...                                                                │
├────────────────────────────────────────────────────────────────────┤
│ Hiển thị 1–10 trong 57 kết quả                   ‹ 1 2 3 4 5 ›     │
└────────────────────────────────────────────────────────────────────┘
```

- **Phía server**: tìm kiếm, lọc, trang, số dòng đều nằm trong URL (`searchParams`), `page.tsx` đọc và truy vấn Prisma.
  Ô tìm kiếm chờ ~400ms rồi mới cập nhật URL (như `DebouncedInput` của Vuexy).
- Hàng bộ lọc: padding 24px, các select cách nhau 24px. Thanh công cụ có viền trên, padding 24px, các phần tử cách nhau 16px.
- **Đầu bảng**: cao 56px, chữ **VIẾT HOA** 13px đậm 500, `tracking-[0.2px]`, màu chữ chính, viền trên.
- **Dòng**: cao 50px, chữ 15px màu chữ phụ, viền dưới `border-border`, hover `bg-muted/50`.
- Padding ô: ngang 16px; ô đầu tiên trái 24px, ô cuối phải 24px.
- Cột tên: avatar 34px + tên (h6, chữ chính) + dòng phụ 13px (mã NV hoặc email).
- Cột thao tác: nút icon (xem, sửa) + menu ⋮.
- **Phân trang**: chữ "Hiển thị X–Y trong Z kết quả" bên trái (13px, chữ phụ), nút trang bên phải. Nút trang vuông bo 6px,
  trang hiện tại `bg-primary text-primary-foreground shadow-primary-sm`, trang khác `bg-muted`.
- **Đang tải**: `loading.tsx` dùng `Skeleton` cho 5–10 dòng.
- **Rỗng**: một dòng `colSpan` đầy đủ, dùng mẫu trạng thái rỗng (5.6). Vuexy chỉ ghi "No data available"; mình làm rõ hơn.

### 5.3 Form trong dialog

Theo `views/pages/dialog-examples/` và `views/apps/user/list/AddUserDrawer.tsx`.

Cấu trúc **bắt buộc** cho mọi dialog: **header cố định – thân cuộn – footer cố định**
(`src/components/ui/dialog.tsx`). Dialog không bao giờ cao quá màn hình: nội dung dài (xem trước video, trình soạn thảo, PDF…)
thì chỉ `DialogBody` cuộn, nút Huỷ / Lưu luôn nhìn thấy (kể cả cửa sổ chỉ cao ~700px).

```tsx
<Dialog>
  <DialogContent className="sm:max-w-2xl">          {/* cao tối đa 100dvh − 4rem, flex cột */}
    <DialogHeader>                                  {/* cố định */}
      <DialogTitle>Thêm người dùng</DialogTitle>
      <DialogDescription>Nhập thông tin nhân viên mới</DialogDescription>
    </DialogHeader>
    {/* form “trong suốt” (display: contents): body + footer là con trực tiếp của cột */}
    <form action={formAction} className="contents" noValidate>
      <input type="hidden" name="id" value={id} />    {/* input ẩn đặt ngoài DialogBody */}
      <DialogBody>                                   {/* PHẦN DUY NHẤT được cuộn */}
        <FormGrid cols={2}>                          {/* lưới form: luôn items-start */}
          <FormField label="Mã nhân viên" htmlFor="employeeCode" required hint="VD: NV001" error={err.employeeCode}>
            <Input id="employeeCode" name="employeeCode" />
          </FormField>
          <FormField label="Họ tên" htmlFor="fullName" required error={err.fullName}>
            <Input id="fullName" name="fullName" />
          </FormField>
          <FormField label="Ghi chú" htmlFor="note" span="full">…</FormField>  {/* ô chiếm cả hàng */}
        </FormGrid>
      </DialogBody>
      <DialogFooter>                                 {/* cố định, KHÔNG thêm col-span / pt */}
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>{pending ? "Đang lưu..." : "Lưu"}</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

- **Quy ước lưới form** (`src/components/form-field.tsx`): luôn dùng `FormGrid` (`cols` 1 / 2 / 3, `items-start`, cách nhau 16px dọc / 24px ngang)
  + `FormField`. **Không tự viết** `grid grid-cols-*` cho form. Ô chiếm cả hàng: `span="full"`.
  Lý do: lưới CSS mặc định kéo giãn các ô cùng hàng (`stretch`) → ô có chú thích / lỗi làm nhãn và ô nhập bên cạnh lệch xuống.
- `FormField` cấu trúc cố định: **nhãn** (cao đúng 1 dòng 20px, dấu `*` đỏ cùng dòng, nhãn dài bị cắt `…` + `title`) → **ô nhập** →
  **chú thích / lỗi** (chỉ nằm dưới ô, không ảnh hưởng ô cùng hàng). Container `content-start` nên không giãn kể cả khi đặt ngoài `FormGrid`.
- Nút chọn dạng segmented (“Một đáp án / Nhiều đáp án”, “Tự sinh / Tự nhập”): dùng `SegmentedControl` (`src/components/segmented-control.tsx`),
  cao **38px** như input / select, phím ← → đổi lựa chọn. Thẻ chọn lớn dạng card (loại bài, nguồn video…) không dùng component này.
- Danh sách dòng có ô nhập (VD phương án A–F): phần đầu dòng (radio / checkbox + nhãn) có **độ rộng cố định** để các ô nhập thẳng mép trái;
  dòng `flex items-center` để nút xoá căn giữa với ô nhập.
- `FormGrid` đặt bên trong `DialogBody`, không đặt ở `<form>`.
- `DialogBody` có lề âm + padding ngang để viền focus của ô nhập không bị cắt và thanh cuộn sát mép dialog.
- Dialog không có form (VD màn hiện mật khẩu): `DialogHeader` – `DialogBody` – `DialogFooter` như trên.
- Độ rộng: dialog ngắn `sm:max-w-lg`; form 2 cột `sm:max-w-2xl`; **dialog bài học (cả 3 loại) `sm:max-w-3xl`**.
- Khung xem trước video trong dialog: tối đa **640px**, tỉ lệ 16:9, căn giữa (`mx-auto max-w-[640px]`).
- Hộp xác nhận (`AlertDialog`) cũng cao tối đa `100dvh − 4rem` và tự cuộn nếu mô tả dài.

- Form ngắn (≤ 8 ô): dialog. Form dài hoặc nhiều tab: trang riêng. Form cần nhìn bảng phía sau: `Sheet` bên phải (như `AddUserDrawer`, rộng 400px).
- Lưới 2 cột, ô dài (mô tả, ghi chú) chiếm 2 cột.
- Nút: Huỷ (outline) + Lưu (primary). Khi đang gửi, nút Lưu khoá lại và đổi chữ.
- Lỗi lấy từ zod trong server action, hiển thị dưới từng ô, tiếng Việt.

### 5.4 Badge trạng thái

Theo `Chip variant='tonal' size='small'` trong `UserListTable.tsx`. Kiểu tonal: nền màu 16%, chữ màu main,
13px đậm 500, bo 4px, cao 24px, padding ngang 10px.

```tsx
<span className="inline-flex h-6 items-center rounded-sm bg-success/16 px-2.5 text-[13px] font-medium text-success">
  Hoạt động
</span>
```

**Quy ước: badge / pill KHÔNG BAO GIỜ xuống dòng** — luôn `inline-flex items-center whitespace-nowrap shrink-0`.
Dùng component có sẵn trong `src/components/status-badge.tsx`: `StatusBadge` (trạng thái, vai trò, cách giao, nguồn khoá…)
và `CountPill` (ô đếm số tròn: “6 mới”, số cạnh tab / chip; > 99 hiện “99+”). Không tự viết `<span className="rounded-full …">`.
Hàng chứa badge cạnh nút / chữ dài: đặt badge trong cụm `inline-flex items-center gap-2`, phần chữ dài mới được co (`min-w-0`).

Bảng màu trạng thái dùng thống nhất toàn hệ thống:

| Màu | Trạng thái |
|---|---|
| success | Hoạt động, Đã phát hành, Hoàn thành, Đạt, Còn hạn |
| warning | Chờ duyệt, Sắp đến hạn, Đang xử lý video, Đề xuất MAJOR |
| destructive | Quá hạn, Không đạt, Hết hạn, Đã huỷ |
| secondary | Đã khoá, Nháp, Chưa bắt đầu, Ẩn |
| info | Lưu trữ, Tự đăng ký |
| primary | Đang học, Bắt buộc, Được giao |

### 5.5 Avatar chữ cái

Theo `CustomAvatar` + `getInitials` trong `UserListTable.tsx`.

- Tròn, **34px** trong bảng, 38px trên header, 100px+ ở trang hồ sơ. Chữ 15px, đậm 500.
- Có ảnh thì hiện ảnh; không có thì hiện chữ cái.
- **Chữ cái tên tiếng Việt**: lấy chữ đầu của **tên** (từ cuối) và **họ** (từ đầu), viết hoa.
  VD "Nguyễn Văn An" → "NA"; "Trần Bình" → "TB"; chỉ một từ → một chữ.
- Màu tonal (`bg-x/16 text-x`), chọn cố định theo id người dùng (băm id ra 1 trong 6 màu) để mỗi người luôn cùng một màu.

```tsx
<Avatar className="size-[34px]">
  <AvatarImage src={user.avatarUrl ?? undefined} />
  <AvatarFallback className="bg-primary/16 text-[15px] font-medium text-primary">NA</AvatarFallback>
</Avatar>
```

### 5.6 Trạng thái rỗng

Vuexy không có mẫu riêng, mình quy định:

```tsx
<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
  <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
    <Inbox className="size-8" />
  </div>
  <p className="text-lg font-medium text-foreground">Chưa có người dùng nào</p>
  <p className="max-w-sm text-[15px] text-muted-foreground">Thêm người dùng mới hoặc import từ file Excel.</p>
  <Button>+ Thêm người dùng</Button>
</div>
```

- Có bộ lọc mà không ra kết quả: "Không tìm thấy kết quả phù hợp" + nút "Xoá bộ lọc".
- Có thể dùng ảnh minh hoạ của Vuexy (`public/images/illustrations/`) sau khi copy sang `public/`.

### 5.7 Card khoá học

Theo `views/apps/academy/my-courses/Courses.tsx`.

- Card có viền (`border`, không bóng), padding 8px. Ảnh bìa bo 6px, tỷ lệ 16:9.
- Dưới ảnh, padding 16px: hàng [badge nhãn (Bắt buộc / Được giao / Tự đăng ký)] + [thông tin phụ bên phải].
- Tên khoá h5 (2 dòng tối đa), mô tả body2 màu phụ.
- Hạn hoàn thành: icon đồng hồ + ngày `dd/MM/yyyy`; quá hạn thì chữ `text-destructive`.
- Thanh tiến độ cao 8px, bo tròn, màu primary; kèm "% hoàn thành".
- Nút: "Tiếp tục học" (primary) hoặc "Bắt đầu" (tonal).
- Lưới 3 cột, cách nhau 24px. Phía trên: tabs + ô tìm kiếm + select danh mục.

---

## 6. Đối chiếu trang Vuexy → trang của hệ thống

Đường dẫn Vuexy tính từ `src/views/` (trang demo chạy ở `/[lang]/apps/...`, `/[lang]/pages/...`).
Đường dẫn của mình lấy từ `src/lib/roles.ts`.

| Trang Vuexy làm khuôn | Trang của mình (feature-spec) | Đường dẫn |
|---|---|---|
| `Login.tsx` (pages/auth) | Đăng nhập, đổi mật khẩu (2.1) | `/login`, `/change-password` |
| `apps/academy/dashboard` (WelcomeCard, CourseTable, TopCourses, UpcomingWebinar) | Tổng quan học viên (2.2) | `/dashboard` |
| `apps/academy/my-courses` | Khoá học của tôi (2.3) | `/my-courses` |
| `apps/academy/my-courses` (phần lưới khoá) | Thư viện khoá học (2.7) | `/library` |
| `apps/academy/course-details` (Details + Sidebar mục lục) | Trang học / trình phát (2.4), giới thiệu khoá | `/my-courses/[id]` |
| `pages/wizard-examples` (các bước) + `apps/academy/course-details` | Làm bài kiểm tra (2.5) | trong trang học |
| `dashboards/crm/ActivityTimeline` | Lộ trình học dạng timeline (2.6) | `/learning-paths` |
| `apps/invoice/list` (bảng) | Chứng nhận (2.9) | `/certificates` |
| `components/layout/shared/NotificationsDropdown.tsx` | Chuông thông báo (2.10) | header |
| `pages/account-settings` | Hồ sơ cá nhân (2.1) | `/profile` |
| `dashboards/crm` (thẻ số liệu, biểu đồ, ProjectStatus) | Tổng quan đội (3.1) | `/team` |
| `apps/user/list` | Nhân viên của đội (3.2) | `/team/members` |
| `apps/user/view` (cột trái thông tin + cột phải tabs) | Chi tiết nhân viên (3.2) | `/team/members/[id]` |
| `apps/user/list` | Danh sách khoá học (4.2) | `/content/courses` |
| `apps/ecommerce/products/add` (form nhiều card) + Tabs | Trình soạn khoá học (4.3) | `/content/courses/[id]` |
| `apps/user/list` | Ngân hàng câu hỏi (4.5) | `/content/questions` |
| `apps/user/list` + dialog | Danh mục (4.1), Lộ trình nội dung (4.6), Chức danh | `/content/categories`, `/content/paths`, `/org/positions` |
| `apps/user/list` + `UserListCards` | Người dùng (5.1) | `/org/users` |
| `apps/roles` (RoleCards) | Mô tả vai trò khi gán quyền (5.1) | dialog trong `/org/users` |
| `apps/user/list` (cây lồng) | Phòng ban (5.2) | `/org/departments` |
| `pages/wizard-examples/create-deal` | Giao thủ công (5.3) | `/assign/manual` |
| `apps/user/list` + dialog | Quy tắc bắt buộc (5.3) | `/assign/rules` |
| `dashboards/analytics` + `dashboards/crm` | Báo cáo (5.5), Dashboard tập đoàn (6.3) | `/reports` |
| `pages/account-settings` (form) | Mẫu chứng nhận (5.6), Cài đặt (6.4) | `/system/certificate-templates`, `/system/settings` |
| `apps/user/list` | Nhật ký (5.6), Công ty con (6.1) | `/system/audit-logs`, `/system/companies` |
| `NotAuthorized.tsx`, `NotFound.tsx` | Không có quyền, không tìm thấy | Không có quyền → chuyển về `/dashboard`; không tìm thấy → `src/app/not-found.tsx`, `src/app/(app)/not-found.tsx` |

---

## 7. Ánh xạ thành phần Vuexy (MUI) → shadcn/ui

Đã có trong `src/components/ui/`: **button, card, input, label, avatar, dropdown-menu, dialog, alert-dialog, select, table,
skeleton, sonner**. Thành phần khác thêm khi cần:
`npx shadcn@latest add <tên>`.

| Vuexy / MUI | shadcn/ui | Ghi chú khi dùng |
|---|---|---|
| `Card`, `CardHeader`, `CardContent`, `CardActions` | `card` ✅ | Padding 24px, `shadow-md` (xem mục 8) |
| `Button` (contained / tonal / outlined / text) | `button` ✅ | contained = `default`, tonal = `secondary`, outlined = `outline`, text = `ghost` |
| `CustomTextField` (TextField) | `input` ✅ + `label` ✅ (hoặc `field`) | Nhãn phía trên ô |
| `CustomTextField select`, `Select` | `select` | |
| `Autocomplete` | `combobox` (`popover` + `command`) | Chọn người, chọn khoá |
| `Chip` tonal | `badge` | Thêm variant tonal theo màu (mục 5.4) |
| `CustomAvatar` | `avatar` | Màu tonal (mục 5.5) |
| `Dialog` | `dialog` | Bo 8px, `shadow-lg` |
| Hộp xác nhận (khoá, huỷ, phát hành) | `alert-dialog` | |
| `Drawer` (AddUserDrawer) | `sheet` | Mở từ phải, rộng 400px |
| `table.module.css` + TanStack Table | `table` | Thông số mục 5.2 |
| `TablePagination`, `Pagination` | `pagination` | Liên kết theo `searchParams` |
| `Tabs`, `TabList`, `TabPanel` | `tabs` | |
| `LinearProgress` | `progress` | Cao 8px, bo tròn |
| `Menu`, `OptionMenu` (⋮) | `dropdown-menu` | |
| `Tooltip` | `tooltip` | |
| `Alert` | `alert` | Banner "Quy trình có cập nhật" |
| `react-toastify` | `sonner` | Góc trên phải như Vuexy |
| `Checkbox`, `Radio`, `Switch` | `checkbox`, `radio-group`, `switch` | |
| `Breadcrumbs` | `breadcrumb` | |
| `Skeleton` | `skeleton` | Trạng thái đang tải |
| `Divider` | `separator` | |
| `Accordion` (mục lục chương) | `accordion` / `collapsible` | Trang học |
| `Rating` | tự làm bằng icon `Star` | Đánh giá khoá |
| Vertical menu (`@menu`) | `sidebar` | Thông số mục 4.1 |
| Navbar | tự làm (header) | Thông số mục 4.2 |
| ApexCharts | `chart` (Recharts) | Màu `--chart-1..5` |
| `Stepper` (wizard) | tự làm bằng Tailwind | Giao thủ công |

---

## 8. Đã làm / chưa làm

**Đã làm**
- Việc 1: biến màu, bo góc, đổ bóng trong `src/app/globals.css` theo Vuexy; thêm màu `success`, `warning`, `info`.
- Việc 2:
  - `button.tsx` cao 38px (sm 30px, lg 48px), chữ 15px, nút chính có `shadow-primary-sm`, bấm thu nhỏ 0.98, vô hiệu `opacity-45`.
  - `input.tsx` cao 38px, chữ 15px, hover viền đậm, focus viền `primary` + `shadow-primary-sm`.
  - Sidebar (`app-sidebar.tsx`), header nổi (`app-header.tsx`, `user-menu.tsx`, `header-breadcrumb.tsx`), logo (`app-logo.tsx`) theo mục 4.
  - Trang đăng nhập theo login-v2 (ảnh ở `public/images/illustrations/auth/`, `public/images/pages/`).
  - Hàm `getInitials` ở `src/lib/initials.ts` (mục 5.5). Thêm shadcn `avatar`, `dropdown-menu`.
- Việc 3 — bộ khuôn bảng dùng chung (dùng mẫu ở `src/app/(app)/org/positions/`):
  - `components/page-header.tsx` — `PageHeader` (tiêu đề h4, mô tả, `actions` bên phải).
  - `components/data-table/data-table.tsx` — `DataTable` (server component): truyền `columns` (`cell: (row) => ReactNode`),
    `rows`, `total`, `page`, `pageSize`, `filters`, `toolbar`, `empty`. Tìm kiếm (chờ 400ms), lọc, số dòng, phân trang đều qua URL.
    Trong `page.tsx` đọc tham số bằng `parseTableParams` / `getEnumParam` (`lib/table-params.ts`), truy vấn Prisma `count` + `findMany`.
    `loading.tsx` dùng `DataTableSkeleton`.
  - `components/status-badge.tsx` — `StatusBadge tone=...` (mục 5.4) và `ActiveBadge` ("Đang dùng" / "Đã ẩn").
  - `components/confirm-dialog.tsx` — `ConfirmDialog` nhận server action đã `bind`, tự khoá nút khi đang xử lý, kết quả hiện toast.
  - `components/form-field.tsx` — `FormField` (nhãn trên, lỗi / gợi ý 13px dưới ô).
  - Form trong dialog: `useActionState` + kiểu `ActionState` (`lib/action-state.ts`: `ok`, `message`, `errors` theo ô, `values`
    để giữ dữ liệu khi lỗi). Thành công → `toast.success` + đóng dialog. Mẫu: `org/positions/position-form-dialog.tsx`.
  - Toast: `sonner`, `<Toaster position="top-right" />` trong `app/layout.tsx`.
  - `lib/format.ts` — `formatDate` (dd/MM/yyyy, giờ Việt Nam), `formatDateTime`, `formatNumber`.
  - Dialog / alert-dialog đã chỉnh: bo 8px, `shadow-lg`, padding 24px, tiêu đề 18px; select cao 38px, chữ 15px.
- Việc 4 — Công ty con (`src/app/(app)/system/companies/`):
  - Mẫu **menu ⋮** trên dòng bảng: `company-row-actions.tsx` (nút Sửa + `DropdownMenu`). Mục menu mở dialog bằng state;
    dialog đặt ngoài menu và điều khiển bằng `open` / `onOpenChange`.
  - `ConfirmDialog` có thêm chế độ điều khiển: bỏ `trigger`, truyền `open` + `onOpenChange`.
- Việc 5 — Phòng ban (`src/app/(app)/org/departments/`):
  - Mẫu **bảng dạng cây** (`department-tree.tsx`): thụt lề 24px/cấp, nút ▸/▾, "Mở tất cả / Thu tất cả"; tìm kiếm hiện phòng khớp
    kèm các phòng cha (dòng cha chữ mờ). Không phân trang — tải hết phòng ban của 1 công ty.
  - `lib/tree.ts`: `buildChildrenMap`, `getAncestorIds`, `getDescendantIds`, `wouldCreateCycle`, `flattenTree`, `normalizeSearch` (bỏ dấu).
  - `DataTableFilter` có `includeAll={false}` + `defaultValue` (ô chọn công ty, không có "Tất cả").
  - shadcn `combobox` (kèm `input-group`, `textarea`): ô chọn có tìm kiếm, cao 38px. Mẫu chọn trưởng phòng ở `department-form-dialog.tsx`.
    Lưu ý: `shadcn add` đang ghi `import { cn } from "cn"` — sau khi thêm component phải đổi sang `@/lib/utils`.
  - Dialog dùng chung cho cả bảng (điều khiển bằng state ở component cha) khi dữ liệu chọn lớn (danh sách nhân viên).
- Sửa căn hàng form: `FormGrid` + `FormField` (nhãn cao cố định, `content-start`), `SegmentedControl` 38px; áp cho mọi dialog / form
  (chức danh, công ty, tạo admin, phòng ban, người dùng, danh mục, khoá học, chương / thêm bài, bài học 3 loại, câu hỏi, gia hạn,
  thông tin khoá, quy tắc giao tự động, import nhân viên / câu hỏi, giao thủ công). Quy ước ở mục 5.3.
- Việc 16 — Ngân hàng câu hỏi (`src/app/(app)/content/questions/`):
  - Trang phụ thuộc 1 tham số cố định (`?course=`): ô chọn khoá (Combobox) ở đầu trang; chưa chọn → trạng thái rỗng.
    `DataTable` có thêm `clearHref` để "Xoá bộ lọc" giữ lại tham số đó.
  - **Thanh tổng hợp dạng chip** (bấm để lọc, chip đang chọn `bg-primary`): số câu theo chủ đề.
  - Dialog lớn có danh sách động (phương án A–F, thêm / xoá dòng, radio hoặc checkbox theo loại) — `question-form-dialog.tsx`.
    Nội dung dạng chữ thường hiển thị bằng `whitespace-pre-line` (không rich text).
  - Ô **chọn có sẵn + gõ mới**: `Input` + `<datalist>` (chủ đề câu hỏi).
  - Import Excel 3 bước có thêm trạng thái **Cảnh báo** (vàng, vẫn import được) — `content/questions/import/`.
  - `textarea.tsx` chỉnh như ô nhập: chữ 15px, hover viền đậm, focus viền `primary` + `shadow-primary-sm`.

**Chưa làm, để các việc sau:**
- `src/components/ui/card.tsx` đang dùng `ring-1` + `rounded-xl` của shadcn → cần đổi sang `shadow-md` + `rounded-md` cho giống card Vuexy.
- `button.tsx`: chưa có variant tonal theo từng màu (hiện `secondary` là tonal xám).
- `label.tsx` vẫn 14px đậm 500; Vuexy là 13px thường (trang đăng nhập đang ghi đè bằng class).
- Sidebar chưa có chế độ thu gọn 71px; header chưa có ô tìm kiếm, chuông thông báo (làm ở mục 2.10).
- Thêm các component shadcn còn thiếu ở mục 7 khi làm chức năng cần đến.

## 9. Thuật ngữ & cách viết

Áp dụng cho MỌI chữ hiển thị: giao diện, thông báo lỗi zod, toast, nội dung thông báo, tiêu đề cột Excel, PDF chứng nhận.

### 9.1 Chính tả (dấu đặt theo kiểu cũ, thống nhất toàn hệ thống)

| Dùng | Không dùng |
|---|---|
| khoá, huỷ, hoá, xoá, thuỷ, tuỳ | khóa, hủy, hóa, xóa, thủy, tùy |

### 9.2 Gọi người theo ngữ cảnh

| Từ | Dùng khi | Ví dụ |
|---|---|---|
| **học viên** | Người học khoá: học, giao khoá, tiến độ, báo cáo theo khoá, thông báo nhắc học | “Chọn học viên”, “Học viên hoạt động 30 ngày” |
| **nhân viên** | Người trong tổ chức: Đội của tôi, phòng ban, import Excel, mã NV | “Import nhân viên”, “Số nhân viên” |
| **người dùng** | Tài khoản đăng nhập: trang Người dùng, khoá / mở khoá, đặt lại mật khẩu, vai trò | “Thêm người dùng”, “Khoá tài khoản” |
| **bạn** | Nói với chính người đang xem | “Bạn đã đọc xong bài này.” |

Không dùng “người học”, “nhân sự”, “user”, “thành viên”.

### 9.3 Từ nghiệp vụ

| Dùng | Không dùng | Ghi chú |
|---|---|---|
| khoá học (gọn: khoá) | khoá đào tạo, course | |
| lượt học | lượt đăng ký, enrollment | 1 người × 1 khoá |
| giao khoá / giao thủ công / quy tắc giao tự động | phân công, gán khoá | |
| bài kiểm tra | kiểm tra, quiz, bài thi | Cả nhãn loại bài: Video · Tài liệu · Bài kiểm tra |
| chứng nhận | chứng chỉ, certificate | |
| phiên bản (bản cập nhật MINOR / MAJOR) | version | |
| phòng ban, chức danh, công ty tổng / công ty con | bộ phận, vị trí | |
| lộ trình | learning path | |
| tài liệu | văn bản | Loại bài DOCUMENT |
| hạn hoàn thành (gọn: hạn) | deadline | |

### 9.4 Nút & dialog
- Nút ghi **động từ + đối tượng**: “Thêm phòng ban”, “Tạo khoá học”, “Gửi nhắc nhở”. Form sửa: “Lưu thay đổi”. Đang xử lý: “Đang lưu...”.
- Nút nguy hiểm (khoá, xoá hẳn, huỷ giao, lưu trữ, tạm ngưng, gỡ video): `variant="destructive"` / `ConfirmDialog tone="destructive"`.
- Dialog xác nhận: tiêu đề là câu hỏi (“Khoá tài khoản NV001?”), mô tả nói rõ **hậu quả** và có hoàn tác được không; nút xác nhận
  lặp lại động từ (“Khoá”, “Huỷ giao”), không dùng “OK” / “Đồng ý”.

### 9.5 Định dạng — luôn dùng `src/lib/format.ts`
| Loại | Hàm | Ví dụ |
|---|---|---|
| Ngày | `formatDate` | 23/11/2026 |
| Ngày giờ | `formatDateTime`, `formatDateTimeSeconds` | 23/11/2026 14:05 |
| Tương đối | `formatRelative` | 5 phút trước |
| Số nguyên | `formatNumber` | 1.234 |
| Số thập phân | `formatDecimal(v, 1)`; luôn 1 chữ số: `formatDecimal(v, 1, true)` | 4,5 · 4,0 |
| Phần trăm | `formatPercent(v)` (v đã là %) | 12,5% |
| Dung lượng | `formatFileSize(bytes)` | 2,1MB |
| Thời lượng | `formatDuration(giây)` | 12:34 · 1:02:05 |

Không gọi trực tiếp `toLocaleString`, `toFixed`, `Intl.*` trong component. Múi giờ luôn Asia/Ho_Chi_Minh.

### 9.6 Tiêu đề tab trình duyệt
`<Tên trang> · <Tên hệ thống trong Cài đặt>` — template ở `src/app/layout.tsx` (`getBranding`); mỗi `page.tsx` khai báo `metadata.title`.
