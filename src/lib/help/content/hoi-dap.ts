import type { HelpChapter } from "../types";
import { ADMINS, ALL, CONTENT, TEAM } from "./roles";

export const HOI_DAP: HelpChapter = {
  id: "hoi-dap",
  title: "Câu hỏi thường gặp",
  description: "Các tình huống hay gặp và cách xử lý.",
  icon: "faq",
  roles: ALL,
  sections: [
    {
      id: "faq-quen-mat-khau",
      title: "Tôi quên mật khẩu, phải làm sao?",
      blocks: [{ type: "p", text: "Liên hệ quản trị đào tạo của công ty để được **Đặt lại mật khẩu**. Bạn sẽ nhận mật khẩu tạm và phải đổi mật khẩu mới khi đăng nhập." }],
    },
    {
      id: "faq-bi-khoa",
      title: "Tài khoản báo đang tạm khoá / đã bị khoá",
      blocks: [
        {
          type: "list",
          items: [
            "**Tạm khoá** (nhập sai mật khẩu 5 lần): chờ 15 phút rồi thử lại, hoặc nhờ quản trị bấm **Mở khoá tạm**.",
            "**Đã bị khoá**: tài khoản bị quản trị khoá (VD: nghỉ việc) — liên hệ quản trị đào tạo nếu có nhầm lẫn.",
          ],
        },
      ],
    },
    {
      id: "faq-video",
      title: "Tôi đã xem hết video nhưng bài chưa được tính hoàn thành",
      blocks: [
        {
          type: "list",
          items: [
            "Phải xem thật đủ tỉ lệ yêu cầu (thường 90%) — đoạn tua qua không được tính. Xem dòng **Đã xem X% · cần Y%** dưới video.",
            "Xem lại đoạn còn thiếu đến khi đủ %, bài sẽ tự chuyển hoàn thành.",
            "Mạng chập chờn có thể làm mất vài giây tiến độ — tải lại trang và xem tiếp.",
          ],
        },
      ],
    },
    {
      id: "faq-het-luot",
      title: "Tôi đã hết lượt làm bài kiểm tra",
      blocks: [{ type: "p", text: "Liên hệ quản trị đào tạo để được **cấp thêm lượt làm bài**. Bạn sẽ nhận thông báo **Được cấp thêm lượt làm bài** và vào làm tiếp được." }],
    },
    {
      id: "faq-khoa-bi-khoa",
      title: "Vì sao bài / khoá có biểu tượng ổ khoá 🔒?",
      blocks: [
        {
          type: "list",
          items: [
            "Bài học: phải học xong bài trước mới mở bài sau.",
            "Khoá trong lộ trình: phải hoàn thành khoá trước trong lộ trình mới mở khoá sau.",
          ],
        },
      ],
    },
    {
      id: "faq-qua-han",
      title: "Khoá bị quá hạn thì sao?",
      blocks: [
        { type: "p", text: "Bạn vẫn học tiếp và hoàn thành được bình thường, nhưng khoá được ghi nhận là quá hạn trong báo cáo và bạn sẽ nhận nhắc nhở định kỳ. Cần thêm thời gian, hãy đề nghị quản trị đào tạo **Gia hạn**." },
      ],
    },
    {
      id: "faq-hoc-lai",
      title: "Vì sao khoá đã học xong lại về 0%?",
      blocks: [
        {
          type: "list",
          items: [
            "Khoá có bản cập nhật **MAJOR** (quy trình thay đổi lớn) → mọi người đã học xong phải học lại.",
            "Hoặc chứng nhận của khoá đã hết hạn → khoá được giao lại để học lại.",
          ],
        },
      ],
    },
    {
      id: "faq-thu-vien",
      title: "Tôi không thấy khoá học trong Thư viện",
      blocks: [{ type: "p", text: "Thư viện chỉ có khoá **đã phát hành** và được bật **Cho phép tự đăng ký**. Khoá bắt buộc sẽ được giao thẳng vào Khoá học của tôi." }],
    },
    {
      id: "faq-chung-nhan",
      title: "Tải chứng nhận ở đâu? Người khác kiểm tra chứng nhận thế nào?",
      blocks: [{ type: "p", text: "Menu **Chứng nhận của tôi** → **Tải PDF**. Để người khác kiểm tra, bấm **Sao chép link tra cứu** và gửi link — họ mở được mà không cần đăng nhập." }],
    },
    {
      id: "faq-truong-phong-khong-thay",
      title: "Trưởng phòng không thấy nhân viên của mình",
      roles: TEAM,
      blocks: [
        { type: "p", text: "Kiểm tra ở **Tổ chức › Phòng ban**: người đó phải được chọn làm **Trưởng phòng** của phòng, và nhân viên phải thuộc phòng đó (hoặc phòng con). Chỉ Admin công ty / tập đoàn sửa được." },
      ],
    },
    {
      id: "faq-nhan-vien-moi",
      title: "Nhân viên mới vào có được giao khoá bắt buộc không?",
      roles: ADMINS,
      blocks: [
        { type: "p", text: "Có, nếu có quy tắc ở **Giao khoá › Quy tắc giao tự động** khớp với công ty / phòng ban / chức danh của họ — khoá được giao ngay khi tạo tài khoản (hoặc khi đổi phòng / chức danh). Giao thủ công chỉ áp dụng cho những người được chọn lúc giao." },
      ],
    },
    {
      id: "faq-sua-khoa-da-phat-hanh",
      title: "Sửa khoá đã phát hành có ảnh hưởng học viên không?",
      roles: CONTENT,
      blocks: [
        { type: "p", text: "Sửa chữ / thêm bài thì học viên thấy ngay. Nếu thay đổi là quy trình mà người đã học xong cần biết, hãy **Phát hành bản cập nhật** (MINOR để xác nhận, MAJOR để học lại) để hệ thống thông báo và theo dõi ai đã nắm bản mới." },
      ],
    },
  ],
};
