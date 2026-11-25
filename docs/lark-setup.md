# Đồng bộ tài khoản và phòng ban từ Lark

Admin tập đoàn dùng **Hệ thống › Kết nối Lark** để đồng bộ một chiều từ danh bạ Lark vào E-Learning. E-Learning lấy thông tin nhân viên, phòng ban, trưởng phòng và trạng thái làm việc. Nhân viên đăng nhập bằng mã nhân viên và mật khẩu E-Learning.

Hệ thống tìm tài khoản đã liên kết theo `user_id` của Lark. Với tài khoản chưa liên kết, hệ thống dùng mã nhân viên `employee_no` để ghép. Các mục thiếu mã hoặc trùng mã khi ghép xuất hiện trong nhóm **Bỏ qua**. Xem thêm [quy tắc đồng bộ trong tài liệu database](database.md#quy-tắc-5--tài-khoản).

## 1. Tạo app trên Lark Developer

1. Vào https://open.larksuite.com/app → **Create Custom App** (app tự xây của doanh nghiệp).
2. **Credentials & Basic Info**: chép **App ID** và **App Secret**.
3. **Permissions & Scopes** → thêm các quyền (Tenant token / “app identity”):

| Quyền (scope) | Dùng để |
|---|---|
| `contact:contact.base:readonly` | Gọi API danh bạ (users/find_by_department) |
| `contact:department.base:readonly` | Tên, trạng thái phòng ban |
| `contact:department.organize:readonly` | Phòng cha, trưởng phòng (`parent_department_id`, `leader_user_id`), gọi departments/children |
| `contact:user.base:readonly` | Họ tên nhân viên |
| `contact:user.employee_id:readonly` | `user_id` của nhân viên (khoá liên kết `users.larkUserId`) |
| `contact:user.employee:readonly` | `employee_no`, `join_time`, `status` (nghỉ việc / đóng băng), `enterprise_email` |
| `contact:user.employee_number:read` | `employee_no` (mã nhân viên = tên đăng nhập E-Learning) |
| `contact:user.department:readonly` | Phòng ban của nhân viên, phòng chính (`department_ids`, `orders[].is_primary_dept`) |
| `contact:user.email:readonly` | `email` (khi không có email doanh nghiệp) |
| `contact:user.phone:readonly` | `mobile` (điện thoại) |

   (Tên quyền lấy từ tài liệu chính thức contact v3: `department/children`, `user/find_by_department` tại open.larksuite.com/document.)
4. **Contacts data range / Phạm vi danh bạ**: chọn **Toàn bộ thành viên (All members)** — đọc phòng gốc `0` cần phạm vi toàn tổ chức.
5. **Version Management & Release** → tạo phiên bản, gửi duyệt; quản trị Lark của doanh nghiệp phê duyệt. Quyền chỉ có hiệu lực sau khi phát hành.

## 2. Nhập cấu hình vào E-Learning

**Cách chính — trên giao diện:** Hệ thống › Kết nối Lark › khối “Cấu hình kết nối”: nhập **App ID**, **App Secret**, chọn máy chủ
(Lark quốc tế / Feishu) → **Lưu cấu hình** → **Kiểm tra kết nối**.
- App Secret được mã hoá AES-256-GCM (khoá dẫn xuất từ `AUTH_SECRET`) trước khi lưu vào `system_settings`, không bao giờ hiện lại trên giao diện
  (chỉ “••••” + 4 ký tự cuối). Để trống ô App Secret khi lưu = giữ secret cũ.
- Đổi `AUTH_SECRET` của máy chủ → secret đã lưu không giải mã được: trang báo, nhập lại App Secret.
- Cấu hình trên giao diện được ưu tiên hơn file `.env`. “Xoá cấu hình” → quay về `.env` (nếu có).

**Cách dự phòng — file `.env`** (xem `.env.example`), dùng khi chưa nhập trên giao diện:

```
LARK_APP_ID=cli_xxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
LARK_DOMAIN=larksuite        # larksuite (Lark quốc tế) | feishu
```

Khởi động lại app. App Secret chỉ dùng ở server, không bao giờ hiện trên giao diện / log.

## 3. Chạy lần đầu

1. **Hệ thống › Kết nối Lark** → **Kiểm tra kết nối** (lấy token + đọc phòng ban cấp 1). Lỗi thường gặp:
   - “Lark từ chối App ID / App Secret” → sai `LARK_APP_ID` / `LARK_APP_SECRET`.
   - “Thiếu quyền… / phạm vi danh bạ” → thiếu quyền ở bảng trên hoặc chưa chọn Toàn bộ thành viên, hoặc chưa phát hành phiên bản app.
2. **Ghép công ty với phòng ban Lark**: mỗi công ty chọn 1 phòng gốc (cây phòng ban, có tìm kiếm). Không ghép 2 công ty vào cùng phòng / phòng lồng nhau.
3. **Chạy thử (xem trước)** → xem 7 nhóm: Tạo mới, Cập nhật, Chuyển công ty, Khoá, Mở lại, Bỏ qua, Chỉ có ở E-Learning (+ Phòng ban, Trưởng phòng, Cảnh báo).
   **Tải Excel chi tiết** để rà kỹ. Lần đầu: phòng ban có sẵn trùng tên được ghép (không tạo trùng).
4. **Áp dụng**. Nếu kế hoạch khoá > 5% người đang hoạt động hoặc > 20 người → cảnh báo đỏ, phải tick “Tôi đã kiểm tra, vẫn áp dụng”.
5. Người mới tạo từ Lark **chưa có mật khẩu** (badge “Chưa có mật khẩu” ở trang chi tiết) → admin bấm **Đặt lại mật khẩu** để cấp mật khẩu tạm.

## 4. Tự đồng bộ

- Tác vụ hằng ngày (`/api/jobs/daily`, `npm run job:daily`) chạy bước **Đồng bộ Lark** ĐẦU TIÊN, chỉ khi đã cấu hình và đã có ít nhất 1 lần áp dụng tay.
  Chạm chốt chặn → không áp dụng, ghi lỗi vào kết quả chạy (Hệ thống › Tác vụ hằng ngày, cột “Lark”).
- Chạy tay từ dòng lệnh: `npm run job:lark-sync` (áp dụng, có chốt chặn) hoặc `npm run job:lark-sync -- --dry` (chỉ xem trước).
- Lịch sử: 30 lần gần nhất ở trang Kết nối Lark; chi tiết trong Nhật ký (thao tác “Đồng bộ Lark”).

## 5. Gửi thông báo qua Lark

Thông báo trong phần mềm (VD **được giao khoá học**, sắp đến hạn, quá hạn, nhắc nhở…) được gửi thêm thành **tin nhắn Lark** dạng thẻ,
có nút **“Mở trong E-Learning”** dẫn thẳng tới khoá / bài. Mọi thông báo vẫn hiện ở chuông trong phần mềm như cũ.

**Bật trên Lark (một lần):**
1. App trên Lark Developer › **Features / Add Features** → bật **Bot**.
2. **Permissions & Scopes** → thêm quyền `im:message:send_as_bot` (gửi tin nhắn với tư cách bot).
3. **Availability / Phạm vi sử dụng app**: chọn toàn bộ nhân viên cần nhận tin (người ngoài phạm vi sẽ báo lỗi
   “Người nhận không nằm trong phạm vi sử dụng của app Lark”).
4. **Version Management & Release** → phát hành phiên bản mới, quản trị Lark duyệt.

**Bật trên E-Learning:** Hệ thống › Kết nối Lark › khối **Gửi thông báo qua Lark**:
- Công tắc **Bật gửi qua Lark** + chọn loại thông báo (mặc định: được giao khoá, sắp đến hạn, quá hạn, nhắc nhở, cập nhật MAJOR / MINOR,
  chứng nhận sắp hết hạn) → **Lưu thay đổi**. Chỉ gửi thông báo tạo **từ lúc bật** (không gửi bù tin cũ).
- **Gửi thử cho tôi**: gửi 1 thẻ tới chính bạn (tài khoản phải đã liên kết Lark qua đồng bộ danh bạ).
- Thống kê: đã gửi hôm nay / đang chờ / lỗi / bỏ qua; 20 tin lỗi gần nhất kèm lý do; **Gửi lại tin lỗi** sau khi đã sửa nguyên nhân.

**Ai nhận được tin:** người **đã liên kết Lark** (`larkUserId`, có sau khi đồng bộ danh bạ) và đang hoạt động. Người tạo tay trong E-Learning,
chưa có trên Lark → chỉ thấy ở chuông (thống kê “Bỏ qua”).

**Gửi lúc nào:** vài giây sau thao tác (giao khoá, nhắc nhở…). Giao cho nhiều người: xếp hàng, ~20 tin / giây, không bỏ ai.
Lark lỗi / mất mạng: tự thử lại sau 1, 5, 15, 60 phút (tối đa 5 lần). Tác vụ hằng ngày gửi nốt tin còn sót.

| Lỗi hay gặp | Cách xử lý |
|---|---|
| “App Lark thiếu quyền gửi tin nhắn…” | Thêm quyền `im:message:send_as_bot`, phát hành phiên bản app, rồi **Gửi lại tin lỗi**. |
| “App Lark chưa bật tính năng Bot.” | Bật Bot (bước 1), phát hành lại. |
| “Người nhận không nằm trong phạm vi sử dụng…” | Thêm người / phòng ban vào phạm vi sử dụng của app, rồi **Gửi lại tin lỗi**. |
| Nút “Mở trong E-Learning” mở sai địa chỉ | Kiểm tra `APP_URL` trong `.env` là địa chỉ thật (https://…). |

## 6. Kiểm thử không cần Lark thật

`e2e/mock-lark/server.ts` giả lập API Lark (token, departments/children, users/find_by_department) trên cổng 3202. `npm run test:env` tự thêm
`LARK_*` trỏ vào giả lập trong `.env.test`. Chạy `npm run test:e2e -- e2e/99-lark.spec.ts` để kiểm tra riêng luồng Lark bằng database kiểm thử.
