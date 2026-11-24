import type { HelpChapter } from "../types";
import { GROUP } from "./roles";

export const QUAN_TRI_TAP_DOAN: HelpChapter = {
  id: "quan-tri-tap-doan",
  title: "Quản trị tập đoàn",
  description: "Tổng quan tập đoàn, công ty con, dữ liệu dùng chung, cài đặt, tác vụ hằng ngày, kết nối Lark.",
  icon: "group",
  roles: GROUP,
  sections: [
    {
      id: "tong-quan-tap-doan",
      title: "Tổng quan tập đoàn",
      blocks: [
        {
          type: "list",
          items: [
            "Menu **Theo dõi học tập › Tổng quan tập đoàn**. Thẻ số liệu toàn tập đoàn: số nhân viên, tỷ lệ hoàn thành, người quá hạn, tỷ lệ nắm quy trình mới, học viên hoạt động 30 ngày.",
            "Bảng **So sánh các công ty** — màu xanh ≥ 90%, vàng 70–89%, đỏ < 70%. Bấm một công ty để mở báo cáo của công ty đó.",
            "Biểu đồ hoàn thành theo tháng, danh sách khoá cần chú ý, hoạt động gần đây.",
          ],
        },
        { type: "shot", name: "td-overview", caption: "Tổng quan tập đoàn" },
      ],
    },
    {
      id: "cong-ty-con",
      title: "Công ty con",
      blocks: [
        {
          type: "list",
          items: [
            "Menu **Tổ chức › Công ty con**. **Thêm công ty con**: nhập Mã, Tên.",
            "**Tạo tài khoản admin** cho công ty con để họ tự quản lý người dùng, giao khoá.",
            "**Tạm ngưng**: mọi nhân viên công ty đó bị đăng xuất và không đăng nhập được; dữ liệu giữ nguyên. **Kích hoạt lại** để dùng tiếp.",
          ],
        },
        { type: "shot", name: "td-companies", caption: "Danh sách công ty con" },
      ],
    },
    {
      id: "du-lieu-dung-chung",
      title: "Danh mục và chức danh dùng chung",
      blocks: [
        { type: "p", text: "Danh mục khoá học và chức danh dùng chung toàn tập đoàn, chỉ Admin tập đoàn quản lý:" },
        {
          type: "list",
          items: [
            "**Soạn nội dung › Danh mục khoá học**: **Thêm danh mục** (Tên, Thứ tự hiển thị), **Lên trên** / **Xuống dưới**, **Sửa**, **Ẩn** / **Hiện lại**.",
            "**Tổ chức › Chức danh**: **Thêm chức danh**, **Ẩn**, **Hiện lại**.",
            "Ẩn thay vì xoá: khoá học / nhân viên đang dùng vẫn giữ nguyên, chỉ không chọn được cho dữ liệu mới.",
          ],
        },
      ],
    },
    {
      id: "cai-dat",
      title: "Cài đặt hệ thống",
      blocks: [
        { type: "p", text: "Menu **Hệ thống › Cài đặt hệ thống**. Sửa rồi bấm **Lưu thay đổi**; **Khôi phục mặc định** để về giá trị ban đầu." },
        {
          type: "table",
          head: ["Thông số", "Mặc định", "Tác dụng"],
          rows: [
            ["Tên hệ thống, Logo", "E-Learning", "Hiện ở menu, trang đăng nhập, trang tra cứu chứng nhận và tiêu đề tab."],
            ["Hạn hoàn thành mặc định", "30 ngày", "Điền sẵn khi giao khoá / tạo quy tắc; hạn học lại khi chứng nhận hết hạn."],
            ["% xem video tối thiểu", "90", "Giá trị mặc định cho bài video mới."],
            ["Nhắc sắp đến hạn trước", "3 ngày", "Gửi thông báo Sắp đến hạn."],
            ["Nhắc lại khi quá hạn mỗi", "7 ngày", "Chu kỳ nhắc Quá hạn."],
            ["Nhắc chứng nhận sắp hết hạn trước", "30 ngày", "Gửi thông báo Chứng nhận sắp hết hạn."],
            ["Giữ thông báo đã đọc / chưa đọc", "180 / 365 ngày", "Quá hạn này thông báo cũ tự dọn."],
          ],
        },
        { type: "p", text: "Thẻ **Video Bunny Stream** (dùng cho bài video tải lên): nhập **Library ID**, **API key**, **Token key**, **Read-Only key** (tuỳ chọn) lấy từ thư viện video trên Bunny → **Lưu cấu hình** → **Kiểm tra kết nối**. Khoá được mã hoá và không hiện lại; để trống ô khoá khi lưu = giữ khoá cũ. Thẻ cũng có địa chỉ webhook để dán vào Bunny và danh sách việc cần bật trong Bunny." },
        { type: "shot", name: "td-settings", caption: "Cài đặt hệ thống" },
        { type: "shot", name: "td-bunny", caption: "Thẻ Video Bunny Stream — nhập khoá trên giao diện" },
      ],
    },
    {
      id: "tac-vu-hang-ngay",
      title: "Tác vụ hằng ngày",
      blocks: [
        { type: "p", text: "Mỗi ngày hệ thống tự chạy một lượt xử lý: đồng bộ Lark, gửi nhắc sắp đến hạn / quá hạn, chấm bài kiểm tra bỏ dở, báo chứng nhận sắp hết hạn và giao học lại khi hết hạn, dọn thông báo cũ." },
        {
          type: "list",
          items: [
            "Trang **Hệ thống › Tác vụ hằng ngày** cho xem 30 lần chạy gần nhất, số việc đã làm và lỗi (nếu có).",
            "**Chạy ngay** để chạy thủ công. Chạy lại trong cùng ngày không gửi thông báo trùng.",
          ],
        },
        { type: "shot", name: "td-jobs", caption: "Tác vụ hằng ngày" },
      ],
    },
    {
      id: "ket-noi-lark",
      title: "Kết nối Lark",
      blocks: [
        { type: "p", text: "Đồng bộ nhân viên, phòng ban, trưởng phòng từ Lark. Lark là nguồn chính cho họ tên, email, điện thoại, phòng ban, công ty, ngày vào làm, nghỉ việc; vai trò và chức danh vẫn quản lý ở E-Learning." },
        {
          type: "steps",
          items: [
            "**Cấu hình kết nối**: nhập App ID, App Secret, chọn **Máy chủ Lark** → **Lưu cấu hình** → **Kiểm tra kết nối**. (Cách tạo app trên Lark: nhờ bộ phận IT theo tài liệu kỹ thuật lark-setup.)",
            "**Ghép công ty với phòng ban Lark**: mỗi công ty chọn 1 phòng gốc trên Lark (**Chọn phòng Lark**).",
            "**Chạy thử (xem trước)**: xem các nhóm Tạo mới / Cập nhật / Chuyển công ty / Khoá / Mở lại / Bỏ qua / Chỉ có ở E-Learning. **Tải Excel chi tiết** để rà kỹ.",
            "**Áp dụng**. Nếu kế hoạch khoá quá nhiều tài khoản, phần mềm dừng lại và cảnh báo đỏ — phải tick **Tôi đã kiểm tra, vẫn áp dụng**.",
          ],
        },
        { type: "shot", name: "td-lark", caption: "Kết nối Lark" },
        {
          type: "list",
          items: [
            "Sau lần áp dụng tay đầu tiên, tác vụ hằng ngày tự đồng bộ (có chốt chặn khoá hàng loạt).",
            "Người mới tạo từ Lark **chưa có mật khẩu** → vào Người dùng, bấm **Đặt lại mật khẩu** để cấp mật khẩu tạm.",
            "Nhân viên nghỉ việc trên Lark sẽ bị khoá ở E-Learning; tài khoản do admin khoá tay không tự mở lại.",
          ],
        },
      ],
    },
  ],
};
