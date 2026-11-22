/**
 * Định nghĩa chỉ số báo cáo (Việc 27) — NGUỒN DUY NHẤT cho: tooltip ⓘ ở tiêu đề cột, sheet Excel “Định nghĩa chỉ số”
 * và docs/reports.md (giữ đồng bộ khi sửa). Dùng được cả server và trình duyệt.
 */

export type MetricKey =
  | "assigned"
  | "inProgress"
  | "notStarted"
  | "completed"
  | "overdue"
  | "completionRate"
  | "avgScore"
  | "firstPassRate"
  | "avgDaysToComplete"
  | "avgRating"
  | "memberCount"
  | "bestScore"
  | "validCertificates"
  | "lastActivity"
  | "currentVersion"
  | "latestRelease"
  | "everCompleted"
  | "acknowledged"
  | "unconfirmed"
  | "relearning"
  | "ackRate"
  | "certExpiresAt"
  | "daysLeft"
  | "relearnStatus"
  | "publishedCourses"
  | "overduePeople"
  | "overduePeopleRate"
  | "groupAckRate"
  | "activeLearners"
  | "activeRate";

export type MetricDefinition = { label: string; definition: string };

export const METRICS: Record<MetricKey, MetricDefinition> = {
  assigned: {
    label: "Được giao",
    definition:
      "Số lượt học được giao (theo quy tắc hoặc giao thủ công), không tính lượt đã huỷ. Mặc định không tính khoá tự đăng ký — bật “Gồm khoá tự đăng ký” để tính cả.",
  },
  inProgress: { label: "Đang học", definition: "Lượt học đã bắt đầu, chưa hoàn thành và chưa quá hạn." },
  notStarted: { label: "Chưa bắt đầu", definition: "Lượt học chưa mở bài nào, chưa quá hạn." },
  completed: { label: "Hoàn thành", definition: "Lượt học đã học xong mọi bài (trạng thái Hoàn thành)." },
  overdue: { label: "Quá hạn", definition: "Lượt học có hạn trước thời điểm xem báo cáo và chưa hoàn thành." },
  completionRate: { label: "Tỷ lệ hoàn thành", definition: "Hoàn thành ÷ Được giao." },
  avgScore: {
    label: "Điểm TB",
    definition:
      "Trung bình của điểm CAO NHẤT mỗi người ở từng bài kiểm tra, chỉ tính các lần làm thuộc phiên bản hiện tại của khoá (thang 100).",
  },
  firstPassRate: {
    label: "Đạt lần đầu",
    definition: "Trong số (người × bài kiểm tra) đã làm ở phiên bản hiện tại: tỷ lệ có lần làm số 1 đạt điểm qua.",
  },
  avgDaysToComplete: { label: "Số ngày hoàn thành TB", definition: "Trung bình (ngày hoàn thành − ngày được giao) của các lượt đã hoàn thành." },
  avgRating: { label: "Đánh giá TB", definition: "Điểm sao trung bình (1–5) của mọi đánh giá học viên đã gửi cho khoá." },
  memberCount: { label: "Số NV", definition: "Số nhân viên đang làm việc trong phạm vi (và trong phòng ban, nếu có lọc)." },
  bestScore: { label: "Điểm cao nhất", definition: "Điểm cao nhất của người này ở các bài kiểm tra của khoá, phiên bản hiện tại." },
  validCertificates: { label: "Chứng nhận còn hạn", definition: "Số chứng nhận chưa bị thu hồi và chưa hết hạn (hoặc không thời hạn)." },
  lastActivity: { label: "Lần học gần nhất", definition: "Thời điểm gần nhất người này có tiến độ ở một bài học bất kỳ." },
  currentVersion: { label: "Phiên bản hiện tại", definition: "Số phiên bản đã phát hành mới nhất của khoá." },
  latestRelease: { label: "Bản mới nhất", definition: "Ngày phát hành và loại (MINOR: chỉ cần xác nhận · MAJOR: phải học lại) của phiên bản hiện tại." },
  everCompleted: { label: "Đã từng hoàn thành", definition: "Số người đã học xong khoá ở ít nhất một phiên bản." },
  acknowledged: { label: "Đã nắm bản mới nhất", definition: "Số người có phiên bản đã nắm = phiên bản hiện tại (học xong hoặc đã xác nhận bản MINOR)." },
  unconfirmed: { label: "Chưa xác nhận (MINOR)", definition: "Đã hoàn thành nhưng chưa bấm xác nhận bản cập nhật MINOR mới nhất." },
  relearning: { label: "Đang học lại (MAJOR)", definition: "Từng hoàn thành nhưng phải học lại do bản MAJOR và chưa học xong." },
  ackRate: { label: "Tỷ lệ đã nắm", definition: "Đã nắm bản mới nhất ÷ Đã từng hoàn thành." },
  certExpiresAt: { label: "Ngày hết hạn", definition: "Ngày chứng nhận hết hiệu lực." },
  daysLeft: { label: "Còn (ngày)", definition: "Số ngày từ hôm nay đến ngày hết hạn; số âm = đã hết hạn bấy nhiêu ngày." },
  publishedCourses: { label: "Khoá đang phát hành", definition: "Số khoá học ở trạng thái Đã phát hành (mọi công ty)." },
  overduePeople: { label: "Người quá hạn", definition: "Số nhân viên có ít nhất 1 khoá được giao đang quá hạn." },
  overduePeopleRate: { label: "% người quá hạn", definition: "Người quá hạn ÷ Số nhân viên." },
  groupAckRate: {
    label: "Tỷ lệ nắm quy trình mới",
    definition: "Trên các khoá đã có phiên bản 2 trở lên: số lượt đã nắm bản mới nhất ÷ số lượt từng hoàn thành.",
  },
  activeLearners: { label: "Người học 30 ngày qua", definition: "Số nhân viên có tiến độ bài học cập nhật trong 30 ngày gần nhất." },
  activeRate: { label: "% người học 30 ngày", definition: "Người học 30 ngày qua ÷ Số nhân viên." },
  relearnStatus: { label: "Học lại", definition: "Trạng thái lượt học hiện tại của khoá (sau khi chứng nhận hết hạn, hệ thống tự giao học lại)." },
};

/** Ghi chú chung về bộ lọc / phạm vi (đầu docs, sheet Định nghĩa). */
export const REPORT_NOTES: MetricDefinition[] = [
  {
    label: "Phạm vi",
    definition:
      "Trưởng phòng: nhân viên các phòng mình làm trưởng và phòng con. Admin công ty: cả công ty. Admin tập đoàn: toàn tập đoàn hoặc công ty đã chọn. Chỉ tính người đang làm việc.",
  },
  { label: "Khoảng thời gian", definition: "Lọc theo NGÀY GIAO của lượt học (không phải ngày hoàn thành). Tab Chứng nhận không áp dụng." },
  { label: "Nguồn", definition: "Mặc định bỏ khoá tự đăng ký. Tab Chứng nhận không áp dụng." },
  { label: "Thời điểm tính", definition: "Quá hạn, còn N ngày… tính tại thời điểm xem / xuất báo cáo." },
];
