import type { HelpChapter } from "../types";
import { ADMINS, CONTENT } from "./roles";

export const BIEN_SOAN: HelpChapter = {
  id: "bien-soan",
  title: "Biên soạn nội dung",
  description: "Soạn khoá học, ngân hàng câu hỏi, lộ trình; phát hành và cập nhật phiên bản.",
  icon: "content",
  roles: CONTENT,
  sections: [
    {
      id: "quy-trinh-soan",
      title: "Quy trình tổng quát",
      blocks: [
        {
          type: "steps",
          items: [
            "Tạo khoá học (trạng thái **Nháp**) và điền thông tin.",
            "Soạn nội dung: chương → bài video / tài liệu / bài kiểm tra.",
            "Nhập câu hỏi vào **Ngân hàng câu hỏi** của khoá (nếu có bài kiểm tra).",
            "**Xem trước** như học viên, rồi **Phát hành** (tạo phiên bản 1).",
            "Admin công ty **giao khoá** cho nhân viên (chương Quản trị công ty) hoặc bật **Cho phép tự đăng ký** để khoá vào Thư viện.",
            "Khi quy trình thay đổi: **Phát hành bản cập nhật** (MINOR hoặc MAJOR).",
          ],
        },
        {
          type: "table",
          head: ["Trạng thái khoá", "Ý nghĩa"],
          rows: [
            ["Nháp", "Đang soạn, học viên chưa thấy. Được xoá hẳn chương / bài / câu hỏi."],
            ["Đã phát hành", "Học viên học được. Chỉ ẩn (không xoá) chương / bài; mọi thay đổi lớn đi qua phiên bản mới."],
            ["Lưu trữ", "Ẩn khỏi Thư viện, không giao mới được; tiến độ và chứng nhận cũ giữ nguyên. Bấm **Khôi phục** để dùng lại."],
          ],
        },
        { type: "tip", text: "Biên soạn và Admin công ty chỉ sửa khoá của công ty mình. Khoá của công ty khác (VD: khoá chung của tập đoàn) hiện nhãn **Chỉ xem**." },
      ],
    },
    {
      id: "danh-sach-khoa",
      title: "Danh sách khoá học và tạo khoá mới",
      blocks: [
        { type: "p", text: "Menu **Soạn nội dung › Khoá học**: lọc theo Công ty sở hữu, Danh mục, Trạng thái (**Nháp / Đã phát hành / Lưu trữ**) hoặc **Có đề xuất chờ duyệt**. Cột Học viên, Đánh giá giúp nhìn nhanh mức độ sử dụng." },
        { type: "shot", name: "bs-courses", caption: "Danh sách khoá học" },
        { type: "steps", items: ["Bấm **Tạo khoá học**.", "Nhập **Mã khoá học** (viết hoa, không trùng, VD: QT-BH-01), **Tên khoá học**, chọn **Danh mục**.", "Bấm **Tạo và soạn** để vào trang soạn."] },
        { type: "shot", name: "bs-create-course", caption: "Tạo khoá học mới" },
      ],
    },
    {
      id: "thong-tin-khoa",
      title: "Tab Thông tin",
      blocks: [
        {
          type: "list",
          items: [
            "Mã, Tên, Mô tả, Danh mục, **Ảnh bìa** (JPG / PNG / WEBP, tối đa 2MB).",
            "**Cho phép tự đăng ký**: khoá hiện trong Thư viện để nhân viên tự học.",
            "**Cấp chứng nhận khi hoàn thành** + **Thời hạn chứng nhận (tháng)** — để trống = vĩnh viễn.",
            "Bấm **Lưu thay đổi**. Rời trang khi chưa lưu, phần mềm sẽ hỏi lại.",
          ],
        },
        { type: "shot", name: "bs-course-info", caption: "Trang soạn khoá — tab Thông tin" },
      ],
    },
    {
      id: "noi-dung-khoa",
      title: "Tab Nội dung: chương và bài",
      blocks: [
        {
          type: "list",
          items: [
            "**Thêm chương**, **Đổi tên**; kéo biểu tượng ⋮⋮ để đổi thứ tự chương / bài. **Mở tất cả** / **Thu gọn tất cả** để xem gọn.",
            "**Thêm bài** trong chương → chọn loại **Video / Tài liệu / Bài kiểm tra** → **Tạo và điền chi tiết**.",
            "Bấm vào bài để sửa chi tiết, rồi **Lưu thay đổi**.",
            "Trước lần phát hành đầu: **Xoá hẳn** được. Sau khi phát hành: chỉ **Ẩn khỏi học viên** / **Hiện lại** (giữ lịch sử học).",
          ],
        },
        { type: "shot", name: "bs-course-content", caption: "Tab Nội dung — danh sách chương và bài" },
        { type: "shot", name: "bs-add-lesson", caption: "Thêm bài: chọn loại bài" },
      ],
    },
    {
      id: "bai-video-soan",
      title: "Soạn bài video",
      blocks: [
        {
          type: "list",
          items: [
            "**Bunny Stream**: tải file video lên (MP4 / MOV / WEBM / MKV, tối đa 4GB). Sau khi tải, video cần vài phút để xử lý — trang hiện tiến độ; chỉ phát hành được khi video đã sẵn sàng.",
            "**YouTube**: dán link video (nên để chế độ Không công khai) → **Dùng video này**.",
            "**% xem tối thiểu để hoàn thành** (mặc định 90): học viên phải xem thật đủ tỉ lệ này.",
            "**Thay video** / **Gỡ video** để đổi video khác.",
          ],
        },
        { type: "shot", name: "bs-lesson-video", caption: "Chi tiết bài video" },
      ],
    },
    {
      id: "bai-tai-lieu-soan",
      title: "Soạn bài tài liệu",
      blocks: [
        { type: "p", text: "Gõ nội dung trong ô **Nội dung** (có định dạng tiêu đề, in đậm, danh sách, bảng, liên kết…) và/hoặc **Tải PDF lên** (tối đa 20MB). Có thể **Thay file** / **Gỡ file**. Bài phải có ít nhất nội dung hoặc file PDF." },
      ],
    },
    {
      id: "bai-kiem-tra-soan",
      title: "Soạn bài kiểm tra",
      blocks: [
        { type: "p", text: "Bài kiểm tra không chứa câu hỏi cố định mà **rút ngẫu nhiên** từ ngân hàng câu hỏi của khoá mỗi lượt làm." },
        {
          type: "table",
          head: ["Thiết lập", "Ý nghĩa (mặc định)"],
          rows: [
            ["Chủ đề câu hỏi", "Chỉ rút câu thuộc chủ đề này, hoặc **Tất cả chủ đề**."],
            ["Số câu rút ngẫu nhiên", "Số câu mỗi lượt (10). Ngân hàng phải có đủ câu đang dùng."],
            ["Điểm đạt (0–100)", "Điểm tối thiểu để đạt (70)."],
            ["Thời gian (phút)", "Hết giờ tự nộp (15)."],
            ["Số lần làm tối đa", "Để trống = không giới hạn. Admin có thể cấp thêm lượt cho từng người."],
            ["Cho xem đáp án sau khi nộp", "Cho học viên xem đúng / sai + giải thích (khi đã đạt hoặc hết lượt)."],
          ],
        },
      ],
    },
    {
      id: "ngan-hang-cau-hoi",
      title: "Ngân hàng câu hỏi",
      blocks: [
        { type: "p", text: "Menu **Soạn nội dung › Ngân hàng câu hỏi** → chọn **Khoá học**. Mỗi khoá có ngân hàng riêng; lọc theo Chủ đề, Loại (**Một đáp án / Nhiều đáp án**), Trạng thái (**Đang dùng / Chờ duyệt / Đã tắt**)." },
        { type: "shot", name: "bs-questions", caption: "Ngân hàng câu hỏi của một khoá" },
        {
          type: "steps",
          items: [
            "Bấm **Thêm câu hỏi**.",
            "Nhập **Nội dung câu hỏi**, **Chủ đề**, chọn **Loại câu hỏi**.",
            "Nhập 2–6 phương án (A–F), đánh dấu phương án đúng. Có thể thêm **Ảnh minh hoạ** và **Giải thích**.",
            "Bấm **Thêm câu hỏi** để lưu.",
          ],
        },
        { type: "shot", name: "bs-question-form", caption: "Thêm câu hỏi" },
        {
          type: "list",
          items: [
            "**Tắt** câu hỏi để ngừng rút vào đề (vẫn giữ lịch sử); **Bật lại** khi cần. **Xoá** chỉ được khi khoá chưa phát hành lần nào.",
            "Câu **Chờ duyệt** (câu gợi ý tự động) chưa được rút vào đề.",
            "**Xuất Excel** để rà soát toàn bộ câu hỏi.",
          ],
        },
      ],
    },
    {
      id: "import-cau-hoi",
      title: "Import câu hỏi từ Excel",
      blocks: [
        {
          type: "steps",
          items: [
            "Ở Ngân hàng câu hỏi, bấm **Import câu hỏi**.",
            "Bấm **Tải file mẫu**, điền câu hỏi theo đúng cột trong file mẫu.",
            "Chọn file → **Kiểm tra file**. Phần mềm báo số dòng **Hợp lệ / Cảnh báo / Lỗi**; **Tải file báo lỗi** để xem chi tiết từng dòng.",
            "Sửa hết dòng lỗi (phải còn 0 lỗi) rồi bấm **Xác nhận import**.",
          ],
        },
        { type: "shot", name: "bs-question-import", caption: "Import câu hỏi" },
      ],
    },
    {
      id: "xem-truoc",
      title: "Xem trước",
      blocks: [
        { type: "p", text: "Tab **Xem trước** mở khoá đúng như học viên thấy, nhưng không khoá tuần tự và không ghi tiến độ. Bài kiểm tra ở đây là **Làm thử** — không lưu kết quả." },
        { type: "shot", name: "bs-preview", caption: "Tab Xem trước" },
      ],
    },
    {
      id: "phat-hanh",
      title: "Phát hành lần đầu",
      blocks: [
        {
          type: "steps",
          items: [
            "Bấm **Phát hành** trên đầu trang soạn.",
            "Xem danh sách **Kiểm tra trước khi phát hành**: có ít nhất 1 bài, video đã sẵn sàng, bài tài liệu có nội dung, ngân hàng đủ câu cho bài kiểm tra. Mục chưa đạt phải sửa trước.",
            "Nhập **Ghi chú phát hành** (không bắt buộc) → **Xác nhận phát hành**. Khoá thành **Đã phát hành**, phiên bản v1.",
          ],
        },
      ],
    },
    {
      id: "ban-cap-nhat",
      title: "Phát hành bản cập nhật (MINOR / MAJOR)",
      blocks: [
        { type: "p", text: "Khoá đã phát hành mà quy trình thay đổi: sửa nội dung như bình thường rồi bấm **Phát hành bản cập nhật**. Hộp thoại có 3 bước **Loại cập nhật → Nội dung → Xác nhận**." },
        {
          type: "table",
          head: ["Loại", "Ảnh hưởng tới người đã học xong", "Ai phát hành"],
          rows: [
            ["MINOR · Đọc & xác nhận", "Chỉ cần đọc tóm tắt và xác nhận trong **Hạn xác nhận (số ngày)**. Tiến độ, điểm, chứng nhận giữ nguyên.", "Biên soạn, Admin công ty, Admin tập đoàn"],
            ["MAJOR · Học lại toàn bộ", "Đặt lại 0%, phải học lại + làm lại bài kiểm tra trong **Hạn học lại (số ngày)**. Người đang học dở giữ tiến độ.", "Admin công ty / tập đoàn phát hành; Biên soạn chỉ **Gửi đề xuất cho Admin**"],
          ],
        },
        { type: "shot", name: "bs-publish-update", caption: "Bước 1: chọn loại cập nhật" },
        {
          type: "list",
          items: [
            "Bước Nội dung: viết **tóm tắt thay đổi** — học viên sẽ đọc phần này.",
            "Bước Xác nhận: xem số người bị ảnh hưởng (VD: **N người sẽ phải HỌC LẠI**). Với MAJOR phải gõ lại mã khoá để xác nhận.",
          ],
        },
        { type: "warn", text: "MAJOR bắt hàng loạt nhân viên học lại — chỉ dùng khi quy trình thay đổi thật sự quan trọng." },
      ],
    },
    {
      id: "duyet-de-xuat",
      title: "Duyệt đề xuất MAJOR",
      roles: ADMINS,
      blocks: [
        { type: "p", text: "Khi Biên soạn gửi đề xuất MAJOR, Admin nhận thông báo **Đề xuất cập nhật quy trình** và trang soạn khoá hiện banner vàng **Có đề xuất cập nhật MAJOR đang chờ duyệt**." },
        {
          type: "list",
          items: [
            "**Duyệt & phát hành**: mở hộp phát hành với nội dung đề xuất, kiểm tra rồi phát hành.",
            "**Từ chối**: nhập **Lý do từ chối** → người đề xuất nhận thông báo **Đề xuất bị từ chối**.",
          ],
        },
        { type: "shot", name: "bs-proposal", caption: "Khoá có đề xuất MAJOR chờ duyệt" },
      ],
    },
    {
      id: "lich-su-danh-gia",
      title: "Lịch sử phiên bản và Đánh giá",
      blocks: [
        { type: "p", text: "Tab **Lịch sử phiên bản**: mọi lần phát hành / đề xuất (loại, tóm tắt, người thực hiện, ngày, hạn, kết quả, lý do từ chối)." },
        { type: "shot", name: "bs-versions", caption: "Lịch sử phiên bản" },
        { type: "p", text: "Tab **Đánh giá**: phân bố số sao và nhận xét của học viên; lọc **Chỉ có nhận xét**, **Xuất Excel**." },
        { type: "shot", name: "bs-reviews", caption: "Đánh giá của học viên" },
      ],
    },
    {
      id: "luu-tru-khoa",
      title: "Lưu trữ / Khôi phục khoá",
      blocks: [
        { type: "p", text: "Khoá không dùng nữa: bấm **Lưu trữ** trên trang soạn. Khoá ẩn khỏi Thư viện và không giao mới được; nhân viên đã học vẫn xem lại được, chứng nhận giữ nguyên. **Khôi phục** để dùng lại." },
      ],
    },
    {
      id: "lo-trinh-soan",
      title: "Lộ trình học",
      blocks: [
        { type: "p", text: "Lộ trình = nhiều khoá đã phát hành học theo thứ tự. Menu **Soạn nội dung › Lộ trình học** → **Tạo lộ trình** (Mã, Tên)." },
        { type: "shot", name: "bs-paths", caption: "Danh sách lộ trình" },
        {
          type: "list",
          items: [
            "**Thêm khoá**, kéo để sắp xếp, **Bỏ khỏi lộ trình** — chỉ khi lộ trình còn Nháp.",
            "**Phát hành** khi có ít nhất 2 khoá đã phát hành. Sau đó thứ tự cố định; chỉ **Thêm khoá vào cuối** (khoá mới được giao luôn cho người đang có lộ trình).",
            "**Lưu trữ** / **Khôi phục** như khoá học.",
          ],
        },
        { type: "shot", name: "bs-path-editor", caption: "Soạn lộ trình" },
      ],
    },
    {
      id: "danh-muc",
      title: "Danh mục khoá học",
      blocks: [
        { type: "p", text: "Danh mục dùng chung toàn tập đoàn để phân loại khoá (Thư viện, bộ lọc, báo cáo). Chỉ **Admin tập đoàn** được thêm / sửa / sắp xếp / ẩn danh mục (xem chương Quản trị tập đoàn); vai trò khác chỉ xem và thấy số khoá của công ty mình trong mỗi danh mục." },
        { type: "shot", name: "bs-categories", caption: "Danh mục khoá học" },
      ],
    },
  ],
};
