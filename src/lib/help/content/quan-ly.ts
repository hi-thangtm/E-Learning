import type { HelpChapter } from "../types";
import { TEAM } from "./roles";

export const QUAN_LY: HelpChapter = {
  id: "theo-doi-hoc-tap",
  title: "Theo dõi học tập",
  description: "Theo dõi tiến độ học của nhân viên, nhắc nhở và xem báo cáo.",
  icon: "team",
  roles: TEAM,
  sections: [
    {
      id: "pham-vi-doi",
      title: "Bạn thấy những ai?",
      blocks: [
        {
          type: "table",
          head: ["Vai trò", "Nhóm Theo dõi học tập hiển thị"],
          rows: [
            ["Quản lý (trưởng phòng)", "Nhân viên các phòng bạn được chỉ định làm trưởng phòng và mọi phòng / nhóm / tổ con bên dưới."],
            ["Admin công ty", "Toàn bộ nhân viên công ty."],
            ["Admin tập đoàn", "Toàn tập đoàn (có thêm bộ lọc Công ty)."],
          ],
        },
        { type: "tip", text: "Trưởng phòng chưa được gán phòng nào sẽ thấy **Bạn chưa được chỉ định làm trưởng phòng nào** — liên hệ Admin công ty để được gán ở Tổ chức › Phòng ban." },
      ],
    },
    {
      id: "tong-quan-doi",
      title: "Tình hình học tập",
      blocks: [
        {
          type: "list",
          items: [
            "4 thẻ: **Số nhân viên**, **Tỷ lệ hoàn thành**, **Người đang quá hạn**, **Chưa nắm quy trình mới**.",
            "Biểu đồ **Tiến độ theo khoá** (10 khoá nhiều người nhất) và **Tỷ lệ hoàn thành theo phòng ban**.",
            "Danh sách **Cần chú ý · Quá hạn nhiều nhất** và **Chưa nắm quy trình mới** — bấm tên để xem chi tiết.",
          ],
        },
        { type: "shot", name: "ql-team", caption: "Tình hình học tập" },
      ],
    },
    {
      id: "nhan-vien-doi",
      title: "Danh sách nhân viên và nhắc nhở",
      blocks: [
        { type: "p", text: "Menu **Tiến độ từng người** liệt kê từng nhân viên với số khoá **Được giao / Đã xong / Đang học / Quá hạn / Chưa nắm quy trình mới** và **Tỷ lệ** hoàn thành. Khoá tự đăng ký không tính vào các cột này." },
        {
          type: "list",
          items: [
            "Tìm theo tên / mã NV, lọc **Phòng ban**, bật **Chỉ người có quá hạn** hoặc **Chỉ người chưa nắm cập nhật**.",
            "Bấm tiêu đề cột để sắp xếp; **Xuất Excel** để tải danh sách theo bộ lọc hiện tại.",
          ],
        },
        { type: "shot", name: "ql-members", caption: "Tiến độ từng người" },
        {
          type: "steps",
          items: [
            "Tick chọn các nhân viên cần nhắc (hoặc **Chọn tất cả N người theo bộ lọc**).",
            "Bấm **Gửi nhắc nhở**.",
            "Chọn **Nhắc về**: **Các khoá đang quá hạn** hoặc **Tất cả khoá chưa hoàn thành**; thêm **Lời nhắn thêm** nếu cần.",
            "Xem số thông báo sẽ gửi rồi bấm **Gửi nhắc nhở (N)**.",
          ],
        },
        { type: "shot", name: "ql-remind", caption: "Hộp Nhắc nhở nhân viên" },
        { type: "tip", text: "Khoá nào đã được nhắc trong hôm nay sẽ tự bỏ qua, tránh nhắc trùng." },
      ],
    },
    {
      id: "chi-tiet-nhan-vien",
      title: "Chi tiết một nhân viên",
      blocks: [
        { type: "p", text: "Bấm tên nhân viên để xem thông tin (mã NV, phòng ban, chức danh, ngày vào làm), bảng **Khoá học** (trạng thái, hạn, phiên bản đã học, điểm cao nhất, **Chưa nắm bản mới**) và **Chứng nhận**. Bấm **Gửi nhắc nhở** để nhắc riêng người này." },
        { type: "shot", name: "ql-member-detail", caption: "Chi tiết tiến độ một nhân viên" },
        { type: "tip", text: "Trưởng phòng chỉ xem và nhắc nhở, không giao khoá. Muốn giao thêm khoá, đề nghị Admin công ty." },
      ],
    },
    {
      id: "bao-cao",
      title: "Báo cáo",
      blocks: [
        { type: "p", text: "Menu **Theo dõi học tập › Báo cáo** có 5 tab:" },
        {
          type: "table",
          head: ["Tab", "Trả lời câu hỏi"],
          rows: [
            ["Theo khoá học", "Mỗi khoá: bao nhiêu người được giao, đã xong, đang học, quá hạn, điểm trung bình."],
            ["Theo phòng ban", "Phòng nào hoàn thành tốt / chậm (có thể cộng dồn phòng con)."],
            ["Theo người", "Từng nhân viên học tới đâu."],
            ["Nắm quy trình mới nhất", "Ai chưa xác nhận / chưa học lại phiên bản mới — có nút **Nhắc xác nhận (N)**."],
            ["Chứng nhận sắp hết hạn", "Chứng nhận hết hạn trong 30 / 60 / 90 ngày hoặc **Đã hết hạn chưa học lại**."],
          ],
        },
        {
          type: "list",
          items: [
            "Bấm **Bộ lọc** để chọn Phòng ban (**Gồm phòng con**), Danh mục, khoảng **Theo ngày giao khoá**, **Gồm khoá tự đăng ký**… **Xoá bộ lọc** để về mặc định.",
            "**Xuất Excel** xuất tab đang xem; **Xuất toàn bộ** xuất tất cả tab trong 1 file.",
          ],
        },
        { type: "shot", name: "ql-reports", caption: "Báo cáo theo khoá học" },
        { type: "tip", text: "Admin tập đoàn có thêm bộ lọc **Công ty**; từ Tổng quan tập đoàn bấm vào một công ty để mở báo cáo của công ty đó.", },
      ],
    },
    {
      id: "nhac-xac-nhan",
      title: "Nhắc nhân viên xác nhận quy trình mới",
      blocks: [
        { type: "p", text: "Ở tab **Nắm quy trình mới nhất**, chọn khoá có bản cập nhật MINOR rồi bấm **Nhắc xác nhận (N)** để gửi thông báo cho những người chưa bấm “Tôi đã đọc và nắm được”." },
      ],
    },
  ],
};
