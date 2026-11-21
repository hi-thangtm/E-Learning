"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import type { VideoPlayerEvents, VideoPlayerHandle } from "./types";
import type { Ref } from "react";

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Nạp YouTube IFrame Player API đúng 1 lần cho cả trang. */
let apiPromise: Promise<typeof YT> | null = null;
function loadYouTubeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("Không tải được YouTube IFrame API."));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// Mã lỗi YouTube: 2 mã sai, 5 lỗi HTML5, 100 không có / riêng tư, 101 & 150 chủ video tắt nhúng
const EMBED_ERROR = "Video phải để chế độ Không công khai và cho phép nhúng.";
function errorMessage(code: number): string {
  if (code === 100 || code === 101 || code === 150) return EMBED_ERROR;
  if (code === 2) return "Mã video YouTube không hợp lệ.";
  return "Không phát được video YouTube.";
}

const PLAYING = 1;
const PAUSED = 2;
const ENDED = 0;

/**
 * Trình phát YouTube qua IFrame Player API, nhúng từ www.youtube-nocookie.com.
 * Thời lượng lấy bằng getDuration() (thử lại vài lần vì có thể = 0 lúc mới sẵn sàng).
 */
export function YouTubePlayer({
  videoId,
  title,
  startAt,
  ref,
  onReady,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onError,
}: VideoPlayerEvents & { videoId: string; title?: string; startAt?: number; ref?: Ref<VideoPlayerHandle> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const lastTime = useRef(0);

  const getStartAt = useEffectEvent(() => Math.max(0, Math.floor(startAt ?? 0)));
  const emitReady = useEffectEvent((d: number) => onReady?.(d));
  const emitTime = useEffectEvent((t: number) => onTimeUpdate?.(t));
  const emitPlay = useEffectEvent(() => onPlay?.());
  const emitPause = useEffectEvent((t: number) => onPause?.(t));
  const emitEnded = useEffectEvent(() => onEnded?.());
  const emitError = useEffectEvent((m: string) => onError?.(m));

  useImperativeHandle(ref, () => ({
    seekTo: (seconds) => {
      playerRef.current?.seekTo(seconds, true);
      lastTime.current = seconds;
    },
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? lastTime.current,
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // YouTube thay thẻ này bằng iframe -> tạo thẻ riêng ngoài cây React để React không đụng tới
    const mount = document.createElement("div");
    mount.className = "size-full";
    host.appendChild(mount);

    let cancelled = false;
    let ticker: ReturnType<typeof setInterval> | null = null;
    let durationRetry: ReturnType<typeof setTimeout> | null = null;

    const stopTicker = () => {
      if (ticker) clearInterval(ticker);
      ticker = null;
    };

    loadYouTubeApi()
      .then((api) => {
        if (cancelled) return;
        const start = getStartAt();
        lastTime.current = start;
        playerRef.current = new api.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1, origin: window.location.origin, ...(start > 0 && { start }) },
          events: {
            onReady: (e) => {
              let tries = 0;
              const readDuration = () => {
                const d = e.target.getDuration();
                if (d > 0 || tries >= 10) emitReady(d > 0 ? d : 0);
                else {
                  tries++;
                  durationRetry = setTimeout(readDuration, 500);
                }
              };
              readDuration();
            },
            onStateChange: (e) => {
              if (e.data === PLAYING) {
                emitPlay();
                stopTicker();
                ticker = setInterval(() => {
                  const t = e.target.getCurrentTime();
                  lastTime.current = t;
                  emitTime(t);
                }, 1000);
              } else {
                stopTicker();
                const t = e.target.getCurrentTime?.() ?? lastTime.current;
                lastTime.current = t;
                emitTime(t);
                if (e.data === PAUSED) emitPause(t);
                if (e.data === ENDED) emitEnded();
              }
            },
            onError: (e) => emitError(errorMessage(Number(e.data))),
          },
        });
      })
      .catch(() => emitError("Không tải được trình phát YouTube. Kiểm tra kết nối mạng."));

    return () => {
      cancelled = true;
      stopTicker();
      if (durationRetry) clearTimeout(durationRetry);
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.remove();
    };
  }, [videoId]);

  return <div ref={hostRef} className="size-full" title={title} />;
}
