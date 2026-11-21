/**
 * Kiểu cho gói "player.js" (Embedly, 0.1.0 — không kèm type). Chỉ khai báo phần dùng với iframe Bunny Stream.
 * Gói truy cập `window` khi nạp -> chỉ import động ở trình duyệt.
 */
declare module "player.js" {
  type TimeUpdate = { seconds: number; duration: number };

  export class Player {
    constructor(iframe: HTMLIFrameElement | string);
    on(event: "ready" | "play" | "pause" | "ended" | "error", callback: () => void): void;
    on(event: "timeupdate", callback: (data: TimeUpdate) => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
    play(): void;
    pause(): void;
    getDuration(callback: (seconds: number) => void): void;
    getCurrentTime(callback: (seconds: number) => void): void;
    setCurrentTime(seconds: number): void;
  }

  const playerjs: { Player: typeof Player };
  export default playerjs;
}
