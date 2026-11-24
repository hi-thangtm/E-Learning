import type { HelpChapter } from "../types";
import { ALL, STAFF } from "./roles";

export const BAT_DAU: HelpChapter = {
  id: "bat-dau",
  title: "Bắt đầu",
  description: "Đăng nhập, đổi mật khẩu, làm quen màn hình và vai trò.",
  icon: "start",
  roles: ALL,
  sections: [
    {
      id: "dang-nhap",
      title: "Đăng nhập",
      blocks: [
        { type: "p", text: "Mỗi nhân viên đăng nhập bằng **Mã nhân viên** (VD: TM-001) và mật khẩu do quản trị đào tạo cấp. Mã nhân viên không phân biệt chữ hoa / thường." },
        {
          type: "steps",
          items: [
            "Mở địa chỉ phần mềm trên máy tính hoặc điện thoại.",
            "Nhập **Mã nhân viên** và **Mật khẩu** (bấm biểu tượng con mắt để xem lại mật khẩu đã gõ).",
            "Bấm **Đăng nhập**. Lần đầu tiên, phần mềm sẽ yêu cầu bạn đặt mật khẩu mới (xem mục Đổi mật khẩu).",
          ],
        },
        { type: "shot", name: "login", caption: "Màn hình đăng nhập" },
        {
          type: "warn",
          text: "Nhập sai mật khẩu 5 lần liên tiếp, tài khoản bị **khoá tạm 15 phút**. Chờ hết thời gian rồi thử lại, hoặc nhờ quản trị đào tạo mở khoá ngay.",
        },
        {
          type: "table",
          head: ["Thông báo khi đăng nhập", "Ý nghĩa / cách xử lý"],
          rows: [
            ["Mã nhân viên hoặc mật khẩu không đúng", "Kiểm tra lại mã và mật khẩu (chú ý bộ gõ tiếng Việt, phím Caps Lock)."],
            ["Tài khoản đang tạm khoá do nhập sai mật khẩu nhiều lần…", "Chờ 15 phút hoặc liên hệ quản trị đào tạo."],
            ["Tài khoản đã bị khoá. Vui lòng liên hệ quản trị đào tạo.", "Tài khoản đã bị khoá (VD: nghỉ việc). Liên hệ quản trị đào tạo nếu nhầm."],
            ["Công ty của bạn đang tạm ngưng sử dụng hệ thống.", "Công ty đang bị tạm ngưng — liên hệ Admin tập đoàn."],
          ],
        },
        { type: "tip", text: "Quên mật khẩu? Phần mềm không tự gửi mật khẩu qua email. Hãy nhờ quản trị đào tạo công ty bấm **Đặt lại mật khẩu** để cấp mật khẩu tạm." },
      ],
    },
    {
      id: "doi-mat-khau",
      title: "Đổi mật khẩu",
      blocks: [
        { type: "p", text: "Bấm ảnh đại diện góc trên bên phải → **Đổi mật khẩu**. Lần đăng nhập đầu tiên (hoặc sau khi được đặt lại mật khẩu) phần mềm tự chuyển tới trang này và bạn phải đổi mới dùng tiếp được." },
        {
          type: "list",
          items: [
            "Mật khẩu mới tối thiểu **8 ký tự**, có ít nhất **1 chữ cái và 1 chữ số**, khác mật khẩu hiện tại.",
            "Nhập **Mật khẩu hiện tại**, **Mật khẩu mới**, **Nhập lại mật khẩu mới** rồi bấm **Đổi mật khẩu**.",
            "Đổi xong, các phiên đăng nhập trên thiết bị khác sẽ bị đăng xuất.",
          ],
        },
        { type: "shot", name: "change-password", caption: "Trang Đổi mật khẩu" },
      ],
    },
    {
      id: "bo-cuc",
      title: "Làm quen màn hình",
      blocks: [
        {
          type: "list",
          items: [
            "**Menu bên trái**: các chức năng theo vai trò của bạn, chia nhóm (xem bảng dưới). Bấm tên nhóm để thu gọn / mở nhóm — máy sẽ nhớ lựa chọn; nhóm chứa trang đang mở luôn mở. Trên điện thoại, bấm nút ☰ để mở menu.",
            "**Thanh trên cùng**: đường dẫn trang đang xem, ô tìm nhanh, chuông thông báo (số đỏ = tin chưa đọc) và ảnh đại diện.",
            "**Menu tài khoản** (bấm ảnh đại diện): Thông báo, Đổi mật khẩu, Hướng dẫn sử dụng, Đăng xuất.",
          ],
        },
        {
          type: "table",
          head: ["Nhóm menu", "Dùng để", "Ai thấy"],
          rows: [
            ["Học tập", "Việc học của chính bạn: khoá học, lộ trình, thư viện, chứng nhận.", "Mọi người"],
            ["Theo dõi học tập", "Xem nhân viên học tới đâu, ai quá hạn, gửi nhắc nhở, báo cáo.", "Trưởng phòng (các phòng mình phụ trách), Admin công ty, Admin tập đoàn"],
            ["Giao khoá", "Giao khoá học / lộ trình cho nhân viên, đặt quy tắc giao tự động.", "Admin công ty, Admin tập đoàn"],
            ["Soạn nội dung", "Soạn khoá học, câu hỏi, lộ trình học, danh mục.", "Biên soạn nội dung, Admin công ty, Admin tập đoàn"],
            ["Tổ chức", "Công ty con, người dùng, phòng ban, chức danh.", "Admin công ty, Admin tập đoàn"],
            ["Hệ thống", "Mẫu chứng nhận, nhật ký thao tác, cài đặt, kết nối.", "Admin công ty, Admin tập đoàn"],
          ],
        },
        { type: "shot", name: "layout-admin", caption: "Bố cục màn hình của Admin tập đoàn — menu đầy đủ nhất" },
        { type: "shot", name: "user-menu", caption: "Menu tài khoản" },
      ],
    },
    {
      id: "tim-nhanh",
      title: "Tìm nhanh (Ctrl + K)",
      roles: STAFF,
      blocks: [
        { type: "p", text: "Ô **Tìm nhân viên, khoá học…** trên thanh trên cùng (hoặc phím tắt **Ctrl + K**) giúp mở nhanh hồ sơ nhân viên hoặc khoá học trong phạm vi bạn được xem." },
        { type: "steps", items: ["Bấm vào ô tìm kiếm hoặc nhấn Ctrl + K.", "Gõ tên hoặc mã (không cần gõ dấu).", "Dùng phím ↑ ↓ để chọn, Enter để mở, Esc để đóng."] },
        { type: "shot", name: "quick-search", caption: "Tìm nhanh khoá học" },
      ],
    },
    {
      id: "vai-tro",
      title: "Vai trò và quyền",
      blocks: [
        { type: "p", text: "Mỗi tài khoản có 1 vai trò. Ai cũng có phần **Học tập** để học các khoá được giao; các vai trò quản lý có thêm menu tương ứng." },
        {
          type: "table",
          head: ["Vai trò", "Làm được gì", "Phạm vi dữ liệu"],
          rows: [
            ["Học viên", "Học khoá được giao / tự đăng ký, làm bài kiểm tra, nhận chứng nhận", "Của bản thân"],
            ["Quản lý (trưởng phòng)", "Theo dõi học tập của nhân viên phòng mình, nhắc nhở, xem báo cáo", "Các phòng mình làm trưởng và phòng con"],
            ["Biên soạn nội dung", "Soạn khoá học, ngân hàng câu hỏi, lộ trình; đề xuất cập nhật lớn", "Khoá của công ty mình"],
            ["Admin công ty", "Quản lý người dùng, phòng ban, giao khoá, duyệt nội dung, báo cáo, nhật ký", "Toàn bộ công ty mình"],
            ["Admin tập đoàn", "Mọi chức năng + công ty con, cài đặt, tác vụ hằng ngày, kết nối Lark", "Toàn tập đoàn"],
          ],
        },
        { type: "tip", text: "Trang hướng dẫn này chỉ hiện những chương đúng với vai trò của bạn." },
      ],
    },
    {
      id: "tra-cuu-chung-nhan",
      title: "Tra cứu chứng nhận (không cần đăng nhập)",
      blocks: [
        { type: "p", text: "Bất kỳ ai (VD: đối tác, cơ quan kiểm tra) cũng có thể kiểm tra một chứng nhận là thật tại địa chỉ **/verify** của phần mềm, hoặc mở link tra cứu được chia sẻ từ trang Chứng nhận." },
        { type: "steps", items: ["Mở trang tra cứu, nhập **Mã chứng nhận** (VD: CERT-2026-AB3KZ9, không phân biệt hoa thường).", "Bấm **Tra cứu**."] },
        {
          type: "list",
          items: [
            "Kết quả: **Chứng nhận còn hiệu lực**, **Chứng nhận đã hết hạn**, **Chứng nhận đã bị thu hồi** hoặc **Không tìm thấy chứng nhận**.",
            "Trang chỉ hiện người nhận, khoá học + phiên bản, ngày cấp, hiệu lực, đơn vị cấp — không hiện mã nhân viên, phòng ban hay điểm số.",
          ],
        },
        { type: "shot", name: "verify", caption: "Kết quả tra cứu chứng nhận" },
      ],
    },
  ],
};
