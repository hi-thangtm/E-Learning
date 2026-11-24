import type { HelpChapter } from "../types";
import { ALL } from "./roles";

export const HOC_VIEN: HelpChapter = {
  id: "hoc-vien",
  title: "Học viên",
  description: "Học khoá được giao, làm bài kiểm tra, xác nhận quy trình mới, nhận chứng nhận.",
  icon: "learner",
  roles: ALL,
  sections: [
    {
      id: "tong-quan-hoc-vien",
      title: "Trang Tổng quan",
      blocks: [
        { type: "p", text: "Sau khi đăng nhập, trang **Tổng quan** cho biết ngay bạn cần làm gì:" },
        {
          type: "list",
          items: [
            "Banner **Quy trình có cập nhật**: khoá bạn đã học xong có phiên bản mới — bấm **Xem thay đổi** để đọc và xác nhận trước hạn.",
            "5 thẻ số liệu **Chưa bắt đầu**, **Đang học**, **Đã hoàn thành**, **Quá hạn**, **Chứng nhận** — bấm vào thẻ để mở đúng danh sách.",
            "**Cần làm**: các khoá chưa xong, hạn gần nhất lên trước; dòng tô đỏ là đã quá hạn.",
            "**Tiếp tục học**: tối đa 3 bài đang học dở — bấm để vào học tiếp ngay.",
          ],
        },
        {
          type: "shots",
          items: [
            { name: "hv-dashboard", caption: "Tổng quan trên máy tính" },
            { name: "hv-dashboard-m", caption: "Trên điện thoại" },
          ],
        },
      ],
    },
    {
      id: "khoa-hoc-cua-toi",
      title: "Khoá học của tôi",
      blocks: [
        { type: "p", text: "Danh sách mọi khoá bạn đang có. Dùng các tab **Tất cả / Đang học / Chưa bắt đầu / Hoàn thành / Quá hạn**, lọc theo **Danh mục** hoặc gõ tên khoá để tìm." },
        {
          type: "table",
          head: ["Nhãn trên thẻ khoá", "Ý nghĩa"],
          rows: [
            ["Bắt buộc", "Được giao tự động theo phòng ban / chức danh của bạn."],
            ["Được giao", "Quản trị đào tạo giao trực tiếp cho bạn."],
            ["Tự đăng ký", "Bạn tự đăng ký từ Thư viện (không có hạn)."],
            ["Có cập nhật", "Khoá có phiên bản mới cần bạn đọc và xác nhận."],
            ["Lộ trình: … · Hoàn thành X để mở", "Khoá nằm trong lộ trình, mở sau khi xong khoá trước."],
            ["Quá hạn", "Đã qua hạn hoàn thành mà chưa học xong."],
          ],
        },
        { type: "shot", name: "hv-my-courses", caption: "Khoá học của tôi" },
        { type: "p", text: "Bấm vào khoá để xem trang giới thiệu: hạn hoàn thành, số bài, thời lượng video, tiến độ **Đã xong x/y bài** và mục lục **Nội dung khoá học**. Bấm **Bắt đầu học** / **Tiếp tục học** để vào bài." },
        { type: "shot", name: "hv-course-detail", caption: "Trang giới thiệu khoá học" },
        { type: "tip", text: "Khoá tự đăng ký mà chưa học bài nào có thể **Huỷ đăng ký**. Khoá được giao thì không tự huỷ được." },
      ],
    },
    {
      id: "hoc-bai",
      title: "Học bài: quy tắc chung",
      blocks: [
        {
          type: "list",
          items: [
            "Học **lần lượt**: bài đầu tiên mở sẵn, mỗi bài sau chỉ mở khi xong bài trước (biểu tượng 🔒 = **Hoàn thành bài trước để mở**).",
            "Cột phải là mục lục (bấm **Thu gọn mục lục** để mở rộng vùng học). Dùng **Bài trước** / **Bài tiếp theo** để chuyển bài.",
            "Thanh trên cùng hiện % tiến độ của khoá và **Bài i/n**.",
            "Học xong 100% số bài → khoá chuyển **Hoàn thành**; nếu khoá có cấp chứng nhận, chứng nhận được tạo ngay.",
          ],
        },
      ],
    },
    {
      id: "bai-video",
      title: "Bài video",
      blocks: [
        {
          type: "list",
          items: [
            "Phải **xem thật** đủ tỉ lệ yêu cầu (mặc định **90%**) mới tính xong bài. Dưới video hiện **Đã xem X% · cần Y% để hoàn thành**.",
            "Không tua vượt quá đoạn đã xem — tua quá sẽ bị kéo lại kèm thông báo **Bạn cần xem hết phần trước**.",
            "Phần mềm nhớ vị trí đang xem; lần sau mở lại sẽ xem tiếp.",
            "Xong bài: **Đã hoàn thành bài này — bạn có thể tua tự do để xem lại.**",
          ],
        },
        {
          type: "shots",
          items: [
            { name: "hv-video", caption: "Bài video trên máy tính" },
            { name: "hv-video-m", caption: "Trên điện thoại" },
          ],
        },
      ],
    },
    {
      id: "bai-tai-lieu",
      title: "Bài tài liệu",
      blocks: [
        { type: "p", text: "Đọc nội dung trên trang và/hoặc file PDF đính kèm (**Tải PDF**). Nút **Đã đọc xong** chỉ bấm được sau khoảng 15 giây (hiện **Đọc thêm N giây để xác nhận**)." },
        { type: "shot", name: "hv-document", caption: "Bài tài liệu" },
      ],
    },
    {
      id: "bai-kiem-tra",
      title: "Bài kiểm tra",
      blocks: [
        { type: "p", text: "Màn hình giới thiệu cho biết **Số câu hỏi**, **Thời gian**, **Điểm đạt**, **Lượt còn lại**, **Điểm cao nhất** và **Lịch sử làm bài**." },
        { type: "shot", name: "hv-quiz-intro", caption: "Giới thiệu bài kiểm tra và lịch sử làm bài" },
        {
          type: "steps",
          items: [
            "Bấm **Bắt đầu làm bài** (hoặc **Làm tiếp** nếu đang làm dở). Đồng hồ **Còn lại** bắt đầu đếm ngược.",
            "Đọc yêu cầu: **Chọn 1 đáp án đúng.** hoặc **Chọn tất cả đáp án đúng.** Đáp án được tự lưu.",
            "Dùng **Câu trước** / **Câu sau** hoặc bấm số câu ở bảng bên phải. **Đánh dấu xem lại** để quay lại câu còn phân vân.",
            "Bấm **Nộp bài**. Nếu còn câu chưa trả lời, phần mềm hỏi lại — câu bỏ trống tính là sai.",
          ],
        },
        { type: "shot", name: "hv-quiz-player", caption: "Đang làm bài kiểm tra" },
        {
          type: "list",
          items: [
            "Hết giờ, bài tự nộp. Đóng trình duyệt giữa chừng: có thể vào **Làm tiếp** khi còn giờ; quá giờ, hệ thống tự chấm.",
            "Câu hỏi và phương án được xáo trộn ngẫu nhiên mỗi lượt.",
            "Đạt điểm yêu cầu → bài kiểm tra tính là xong. Không đạt → bấm **Làm lại** nếu còn lượt.",
            "**Xem lại đáp án** chỉ có khi bài kiểm tra cho phép và bạn đã đạt hoặc đã dùng hết lượt.",
          ],
        },
        { type: "shot", name: "hv-quiz-review", caption: "Kết quả một lượt làm bài" },
        { type: "warn", text: "Hết lượt mà chưa đạt: **Bạn đã hết lượt làm bài. Liên hệ quản trị đào tạo để được cấp thêm lượt.**" },
      ],
    },
    {
      id: "hoan-thanh-danh-gia",
      title: "Hoàn thành khoá và đánh giá",
      blocks: [
        {
          type: "list",
          items: [
            "Xong bài cuối, hộp **Chúc mừng bạn đã hoàn thành khoá học!** hiện ra với các nút **Tải chứng nhận** (nếu có), **Chứng nhận của tôi**, **Học khoá tiếp theo**.",
            "Bạn có thể chấm 1–5 sao và viết nhận xét (**Gửi đánh giá**); sửa lại sau ở trang khoá học (**Sửa**). Đánh giá giúp người biên soạn cải thiện khoá.",
          ],
        },
      ],
    },
    {
      id: "cap-nhat-quy-trinh",
      title: "Khoá có phiên bản mới (cập nhật quy trình)",
      blocks: [
        { type: "p", text: "Khi quy trình thay đổi, khoá học được phát hành phiên bản mới. Có 2 loại:" },
        {
          type: "table",
          head: ["Loại", "Bạn cần làm gì"],
          rows: [
            ["Cập nhật nhỏ (MINOR)", "Đọc tóm tắt thay đổi và bấm **Tôi đã đọc và nắm được** trước hạn. Tiến độ, điểm, chứng nhận giữ nguyên."],
            ["Thay đổi lớn (MAJOR)", "Người đã học xong bị đặt lại 0% và phải **học lại toàn bộ** + làm lại bài kiểm tra trước hạn mới."],
          ],
        },
        {
          type: "steps",
          items: [
            "Bấm **Xem thay đổi** trên banner ở Tổng quan (hoặc nhãn **Có cập nhật** trên thẻ khoá).",
            "Đọc phần thay đổi; có thể bấm **Xem lại nội dung khoá**.",
            "Bấm **Tôi đã đọc và nắm được** (nút mở sau 10 giây).",
          ],
        },
        { type: "shot", name: "hv-updates", caption: "Trang Có gì thay đổi" },
      ],
    },
    {
      id: "lo-trinh-hoc-vien",
      title: "Lộ trình",
      blocks: [
        { type: "p", text: "Lộ trình là chuỗi khoá học theo thứ tự (VD: hội nhập nhân viên mới), có **một hạn chung**. Khoá sau chỉ mở khi xong khoá trước." },
        {
          type: "list",
          items: [
            "Menu **Lộ trình của tôi**: danh sách lộ trình của bạn với trạng thái **Đang học / Hoàn thành / Quá hạn** và số khoá đã xong.",
            "Trong lộ trình: ✓ khoá đã xong, **Đang mở** + tiến độ, 🔒 **Hoàn thành X để mở**. Bấm **Học ngay** để vào khoá đang mở.",
          ],
        },
        { type: "shot", name: "hv-path", caption: "Chi tiết lộ trình" },
      ],
    },
    {
      id: "thu-vien",
      title: "Thư viện — tự đăng ký học",
      blocks: [
        { type: "p", text: "**Thư viện khoá học** gồm các khoá cho phép tự đăng ký. Tìm theo tên, sắp xếp **Mới nhất / Nhiều học viên nhất / Đánh giá cao nhất**, lọc theo danh mục." },
        { type: "shot", name: "hv-library", caption: "Thư viện khoá học" },
        { type: "steps", items: ["Bấm vào khoá để xem giới thiệu, phiên bản, số bài, chứng nhận.", "Bấm **Đăng ký học** → **Đăng ký**.", "Khoá xuất hiện trong Khoá học của tôi (nhãn Tự đăng ký, không có hạn). Bấm **Vào học**."] },
        { type: "shot", name: "hv-library-detail", caption: "Giới thiệu khoá trong thư viện" },
        { type: "tip", text: "Điểm sao chỉ hiện khi khoá có từ 3 đánh giá trở lên (ít hơn: **Chưa đủ đánh giá**)." },
      ],
    },
    {
      id: "chung-nhan",
      title: "Chứng nhận",
      blocks: [
        { type: "p", text: "Menu **Chứng nhận của tôi** liệt kê mọi chứng nhận bạn đã nhận: mã chứng nhận, ngày cấp, hiệu lực đến (hoặc **Không thời hạn**)." },
        {
          type: "list",
          items: [
            "**Tải PDF**: tải bản chứng nhận để in / gửi.",
            "**Sao chép link tra cứu**: gửi link cho người cần kiểm tra chứng nhận.",
            "Trạng thái: **Còn hiệu lực**, **Sắp hết hạn** (còn ≤ 30 ngày), **Hết hạn**, **Đã thu hồi**.",
            "Chứng nhận có thời hạn hết hạn → khoá được tự động giao lại để bạn học lại (hạn mặc định 30 ngày).",
          ],
        },
        { type: "shot", name: "hv-certificates", caption: "Chứng nhận của tôi" },
      ],
    },
    {
      id: "thong-bao",
      title: "Thông báo",
      blocks: [
        { type: "p", text: "Chuông trên thanh trên cùng hiện số tin chưa đọc; bấm để xem nhanh, **Đánh dấu tất cả đã đọc** hoặc **Xem tất cả**. Trang Thông báo có tab **Tất cả / Chưa đọc** và lọc theo **Loại**. Bấm vào thông báo để mở đúng khoá / trang liên quan." },
        {
          type: "table",
          head: ["Loại thông báo", "Khi nào"],
          rows: [
            ["Được giao khoá học", "Bạn được giao khoá / lộ trình mới."],
            ["Sắp đến hạn", "Còn 3 ngày (mặc định) tới hạn mà chưa xong."],
            ["Quá hạn", "Đã quá hạn; nhắc lại mỗi 7 ngày (mặc định)."],
            ["Nhắc nhở", "Trưởng phòng / quản trị gửi lời nhắc."],
            ["Quy trình có cập nhật / Quy trình thay đổi lớn", "Khoá bạn đã học có phiên bản MINOR / MAJOR."],
            ["Được cấp thêm lượt làm bài", "Quản trị cấp thêm lượt cho bài kiểm tra."],
            ["Mở khoá học tiếp theo / Hoàn thành lộ trình", "Tiến độ trong lộ trình."],
            ["Nhận chứng nhận / Chứng nhận sắp hết hạn", "Được cấp chứng nhận; chứng nhận còn 30 ngày (mặc định) là hết hạn."],
            ["Đề xuất cập nhật quy trình / Đề xuất bị từ chối", "Dành cho biên soạn và quản trị (xem chương Biên soạn nội dung)."],
          ],
        },
        { type: "shot", name: "hv-notifications", caption: "Trang Thông báo" },
      ],
    },
    {
      id: "dien-thoai",
      title: "Học trên điện thoại",
      blocks: [
        {
          type: "list",
          items: [
            "Mở địa chỉ phần mềm bằng trình duyệt điện thoại (Chrome, Safari) và đăng nhập như trên máy tính.",
            "Mọi trang Học tập (Tổng quan, Khoá học của tôi, Lộ trình, Thư viện, Chứng nhận, Thông báo, bài học) đều dùng tốt trên điện thoại.",
            "Bấm ☰ để mở menu. Trong bài học, bấm nút **Mở mục lục** ở góc trên bên phải để xem danh sách bài.",
            "Mẹo: chọn **Thêm vào màn hình chính** trong trình duyệt để mở phần mềm như một ứng dụng.",
          ],
        },
      ],
    },
  ],
};
