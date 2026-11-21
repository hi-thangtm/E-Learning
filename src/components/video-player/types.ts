import type { Ref } from "react";

/**
 * Giao diện chung của trình phát video — cả YouTube và Bunny trả về CÙNG một kiểu sự kiện.
 * Việc 15 (học viên) dùng để nhớ vị trí + chống tua: onTimeUpdate / seekTo / getCurrentTime.
 */
export type VideoPlayerHandle = {
  /** Nhảy tới giây thứ `seconds` */
  seekTo(seconds: number): void;
  /** Vị trí đang phát gần nhất (giây) */
  getCurrentTime(): number;
};

export type VideoPlayerEvents = {
  /** Trình phát sẵn sàng; duration = thời lượng (giây), 0 nếu không lấy được */
  onReady?: (duration: number) => void;
  /** Gọi khoảng mỗi giây khi đang phát */
  onTimeUpdate?: (currentTime: number) => void;
  /** Bắt đầu / tiếp tục phát */
  onPlay?: () => void;
  /** Tạm dừng (kèm vị trí hiện tại) */
  onPause?: (currentTime: number) => void;
  onEnded?: () => void;
  /** Lỗi phát (thông báo tiếng Việt) */
  onError?: (message: string) => void;
};

export type VideoPlayerProps = VideoPlayerEvents & {
  provider: "YOUTUBE" | "BUNNY";
  videoId: string;
  /** Bunny: URL nhúng kèm token (tạo ở server). YouTube: không cần. */
  embedUrl?: string | null;
  title?: string;
  className?: string;
  /** Mở video tại giây này (trình học: vị trí xem lần trước) */
  startAt?: number;
  ref?: Ref<VideoPlayerHandle>;
};
