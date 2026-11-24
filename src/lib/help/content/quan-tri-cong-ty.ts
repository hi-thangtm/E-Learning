import type { HelpChapter } from "../types";
import { ADMINS } from "./roles";

export const QUAN_TRI_CONG_TY: HelpChapter = {
  id: "quan-tri-cong-ty",
  title: "Quản trị công ty",
  description: "Người dùng, phòng ban, giao khoá, mẫu chứng nhận và nhật ký thao tác.",
  icon: "company",
  roles: ADMINS,
  sections: [
    {
      id: "nguoi-dung",
      title: "Người dùng",
      blocks: [
        { type: "p", text: "Menu **Tổ chức › Người dùng**: danh sách nhân viên công ty (Admin tập đoàn thấy mọi công ty). Lọc theo Công ty, Phòng ban, Chức danh, Vai trò, Trạng thái (**Đang làm / Đã khoá**); biểu tượng ổ khoá = đang khoá tạm do nhập sai mật khẩu." },
        { type: "shot", name: "qt-users", caption: "Danh sách người dùng" },
        {
          type: "steps",
          items: [
            "Bấm **Thêm người dùng**.",
            "Nhập **Mã nhân viên** (là tên đăng nhập, tự viết hoa), Họ tên, Email, Điện thoại, Công ty, Ngày vào làm, Phòng ban, Chức danh, **Vai trò**.",
            "**Mật khẩu ban đầu**: **Tự sinh** (10 ký tự, hiện 1 lần để **Sao chép** gửi nhân viên) hoặc **Tự nhập**.",
            "Lưu. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu.",
          ],
        },
        { type: "shot", name: "qt-user-form", caption: "Thêm người dùng" },
        {
          type: "table",
          head: ["Thao tác trên dòng", "Tác dụng"],
          rows: [
            ["Xem chi tiết", "Hồ sơ, khoá học, chứng nhận, nhật ký gần đây của người đó."],
            ["Sửa thông tin", "Đổi phòng ban, chức danh, vai trò… Đổi công ty: **Chuyển công ty và lưu** (người đó thôi làm trưởng phòng ở công ty cũ)."],
            ["Đặt lại mật khẩu", "Cấp mật khẩu tạm 10 ký tự mới, gỡ khoá tạm; người dùng phải đổi khi đăng nhập."],
            ["Khoá tài khoản / Mở khoá tài khoản", "Khoá khi nghỉ việc — không đăng nhập được, lịch sử học giữ nguyên."],
            ["Mở khoá tạm", "Gỡ khoá 15 phút do nhập sai mật khẩu nhiều lần."],
          ],
        },
        {
          type: "list",
          items: [
            "Admin công ty không gán được vai trò Admin tập đoàn và không sửa được người công ty khác. Không ai tự đổi vai trò của chính mình.",
            "Người có nhãn **Lark** được đồng bộ từ Lark: chỉ sửa được **Vai trò** và **Chức danh**; họ tên, email, phòng ban… sửa trên Lark.",
            "Trang chi tiết có thể hiện **Chưa có mật khẩu** (tạo từ Lark) — bấm **Đặt lại mật khẩu** để cấp mật khẩu cho người đó.",
          ],
        },
        { type: "shot", name: "qt-user-detail", caption: "Chi tiết người dùng" },
      ],
    },
    {
      id: "import-nhan-vien",
      title: "Import nhân viên từ Excel",
      blocks: [
        {
          type: "steps",
          items: [
            "Ở trang Người dùng, bấm **Import nhân viên**.",
            "Chọn công ty, bấm **Tải file mẫu** và điền danh sách theo mẫu.",
            "Chọn file → **Kiểm tra file**. Kết quả chia **Tạo mới / Cập nhật / Không thay đổi / Lỗi**.",
            "Sửa hết lỗi rồi bấm **Import N người**.",
            "Bấm **Tải danh sách mật khẩu tạm** để gửi cho người mới — file chỉ tải được **1 lần**.",
          ],
        },
        { type: "shot", name: "qt-user-import", caption: "Import nhân viên" },
        { type: "tip", text: "Dòng trùng người đồng bộ từ Lark sẽ báo lỗi — thông tin người đó phải sửa trên Lark." },
      ],
    },
    {
      id: "phong-ban",
      title: "Phòng ban",
      blocks: [
        { type: "p", text: "Menu **Tổ chức › Phòng ban** hiển thị dạng cây Phòng › Nhóm › Tổ." },
        {
          type: "list",
          items: [
            "**Thêm phòng ban**: Mã, Tên, **Phòng cha** (để trống = cấp cao nhất), **Trưởng phòng**.",
            "Đổi **Phòng cha** để chuyển phòng sang nhánh khác.",
            "Chọn một Học viên làm trưởng phòng → người đó tự lên vai trò **Quản lý** và thấy nhóm menu **Theo dõi học tập**.",
            "**Ẩn** phòng chỉ được khi không còn phòng con và nhân viên đang hoạt động.",
          ],
        },
        { type: "shot", name: "qt-departments", caption: "Cây phòng ban" },
        { type: "tip", text: "Giao khoá tự động theo phòng ban dựa vào cây này — xếp đúng phòng cho nhân viên để họ được giao đúng khoá." },
      ],
    },
    {
      id: "chuc-danh",
      title: "Chức danh",
      blocks: [
        { type: "p", text: "Chức danh (VD: Nhân viên kinh doanh) dùng chung toàn tập đoàn để gán cho nhân viên và làm điều kiện giao khoá tự động. Chỉ Admin tập đoàn được **Thêm chức danh**, **Ẩn**, **Hiện lại**." },
        { type: "shot", name: "qt-positions", caption: "Chức danh" },
      ],
    },
    {
      id: "giao-khoa",
      title: "Giao khoá học / lộ trình",
      blocks: [
        { type: "p", text: "Menu **Giao khoá › Giao khoá học** → nút **Giao khoá học / lộ trình**. Trình hướng dẫn có 4 bước:" },
        {
          type: "steps",
          items: [
            "**Chọn khoá / lộ trình**: tìm khoá học hoặc lộ trình đã phát hành.",
            "**Cách giao**: **Thủ công — chọn từng người**, hoặc **Tự động — theo nhóm, gồm cả người vào sau** (chuyển sang tạo quy tắc giao tự động).",
            "**Chọn người**: lọc theo Công ty / Phòng ban / Chức danh, tick từng người hoặc **Chọn tất cả N người theo bộ lọc**.",
            "**Đặt hạn**: số ngày kể từ hôm nay, hoặc **Đến ngày** cụ thể. Xem trước kết quả rồi bấm **Xác nhận giao (N thay đổi)**.",
          ],
        },
        { type: "shot", name: "qt-assign-wizard", caption: "Giao khoá — bước 1" },
        {
          type: "table",
          head: ["Nhóm trong bản xem trước", "Nghĩa là"],
          rows: [
            ["Giao mới", "Người chưa có khoá này — sẽ được giao và nhận thông báo."],
            ["Kích hoạt lại", "Từng bị huỷ giao — được giao lại với hạn mới, tiến độ đã học vẫn giữ."],
            ["Đã có — rút ngắn hạn", "Đang có khoá với hạn muộn hơn — hạn được rút về hạn mới."],
            ["Đã có — giữ nguyên", "Đang có khoá với hạn sớm hơn hoặc bằng — không đổi."],
            ["Đã hoàn thành — bỏ qua", "Đã học xong."],
            ["Bỏ qua", "Tài khoản bị khoá hoặc công ty đang tạm ngưng."],
          ],
        },
        { type: "tip", text: "Mỗi người chỉ có 1 lượt học cho mỗi khoá. Giao lại chỉ có thể rút ngắn hạn, không kéo dài — muốn kéo dài dùng **Gia hạn**." },
      ],
    },
    {
      id: "danh-sach-giao",
      title: "Danh sách đã giao: gia hạn, cấp thêm lượt, huỷ giao",
      blocks: [
        { type: "p", text: "Mỗi dòng là 1 lượt học: học viên, khoá, **Cách giao** (**Tự động / Thủ công / Tự đăng ký**), **Trạng thái** (**Chưa bắt đầu / Đang học / Hoàn thành / Đã huỷ**), tiến độ, hạn. Lọc theo khoá, lộ trình, phòng ban, cách giao, trạng thái hoặc **Chỉ quá hạn**." },
        { type: "shot", name: "qt-assign-list", caption: "Trang Giao khoá học — danh sách đã giao" },
        { type: "p", text: "Bấm nút ⋮ cuối mỗi dòng để thao tác:" },
        {
          type: "list",
          items: [
            "**Gia hạn**: chọn **Hạn mới** cho người đó.",
            "**Cấp thêm lượt làm bài**: chọn bài kiểm tra và số lượt thêm (1–5) khi học viên đã hết lượt.",
            "**Huỷ giao**: rút khoá khỏi danh sách của học viên (tiến độ được giữ). Không huỷ được lượt đang được giao theo quy tắc tự động — hãy tắt quy tắc hoặc đổi nhóm áp dụng.",
          ],
        },
        { type: "warn", text: "**Quá hạn** = có hạn, đã qua hết ngày hạn (giờ Việt Nam) mà vẫn Chưa bắt đầu hoặc Đang học." },
      ],
    },
    {
      id: "giao-tu-dong",
      title: "Quy tắc giao tự động",
      blocks: [
        { type: "p", text: "Quy tắc giúp khoá bắt buộc luôn được giao đúng người, kể cả **nhân viên mới vào sau** hoặc người **chuyển phòng / đổi chức danh**. Menu **Giao khoá › Quy tắc giao tự động**." },
        { type: "shot", name: "qt-rules", caption: "Danh sách quy tắc giao tự động" },
        {
          type: "steps",
          items: [
            "Bấm **Tạo quy tắc**, nhập **Tên quy tắc**.",
            "**Giao**: chọn Khoá học hoặc Lộ trình; nhập **Hạn hoàn thành (số ngày kể từ khi được giao)**.",
            "**Nhóm áp dụng**: Công ty (Admin tập đoàn có thêm **Toàn tập đoàn**), Phòng ban (+ **Gồm cả phòng con**), Chức danh. Các điều kiện kết hợp với nhau (VÀ).",
            "Xem phần **Xem trước** (số người khớp, giao mới, đã có, đã xong) rồi bấm **Tạo và giao ngay**.",
          ],
        },
        { type: "shot", name: "qt-rule-form", caption: "Tạo quy tắc giao tự động" },
        {
          type: "list",
          items: [
            "**Tắt quy tắc**: chọn **Giữ các lượt đã giao** hoặc huỷ các lượt **chưa bắt đầu**. **Bật lại** để giao lại theo quy tắc.",
            "Khoá của công ty con chỉ giao được cho nhân viên trong công ty con đó.",
          ],
        },
      ],
    },
    {
      id: "mau-chung-nhan",
      title: "Mẫu chứng nhận và thu hồi chứng nhận",
      blocks: [
        { type: "p", text: "Menu **Hệ thống › Mẫu chứng nhận**: tải **Logo**, **Ảnh chữ ký**, nhập **Tên người ký**, **Chức vụ người ký** → **Lưu mẫu**. Bấm **Xem trước PDF** để xem bản in thử." },
        { type: "shot", name: "qt-cert-template", caption: "Mẫu chứng nhận của công ty" },
        {
          type: "list",
          items: [
            "Mẫu mới chỉ áp dụng cho chứng nhận cấp **sau khi lưu**; chứng nhận đã cấp giữ nguyên.",
            "Mục để trống dùng theo mẫu của công ty tổng.",
            "**Thu hồi** chứng nhận (VD: phát hiện gian lận): vào Người dùng › chi tiết người đó › Chứng nhận › **Thu hồi**, nhập **Lý do thu hồi**. File PDF sẽ có dấu “ĐÃ THU HỒI” và trang tra cứu báo đã thu hồi.",
          ],
        },
      ],
    },
    {
      id: "nhat-ky",
      title: "Nhật ký thao tác",
      blocks: [
        { type: "p", text: "Menu **Hệ thống › Nhật ký thao tác** ghi lại mọi thao tác quản trị (tạo / sửa / khoá người dùng, giao khoá, phát hành, đổi cài đặt…): ai làm, lúc nào, trên đối tượng nào. Chỉ xem, không sửa được." },
        {
          type: "list",
          items: [
            "Lọc theo Công ty, Nhóm thao tác, Loại đối tượng, người thực hiện, khoảng ngày (mặc định 30 ngày gần nhất).",
            "Bấm một dòng để xem **Chi tiết thao tác** (giá trị Trước → Sau).",
            "**Xuất Excel** tối đa 10.000 dòng.",
          ],
        },
        { type: "shot", name: "qt-audit", caption: "Nhật ký thao tác" },
      ],
    },
  ],
};
