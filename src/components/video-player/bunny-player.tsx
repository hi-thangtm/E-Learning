"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from "react";
import type { Player } from "player.js";
import type { VideoPlayerEvents, VideoPlayerHandle } from "./types";

const READY_TIMEOUT_MS = 20_000;

/**
 * Trình phát Bunny Stream: iframe (URL kèm token do server tạo) + Player.js để nhận sự kiện / điều khiển.
 * Player.js truy cập `window` khi nạp -> import động trong effect.
 */
export function BunnyPlayer({
  embedUrl,
  title,
  startAt,
  ref,
  onReady,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onError,
}: VideoPlayerEvents & { embedUrl: string; title?: string; startAt?: number; ref?: Ref<VideoPlayerHandle> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<Player | null>(null);
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
      playerRef.current?.setCurrentTime(seconds);
      lastTime.current = seconds;
    },
    getCurrentTime: () => lastTime.current,
  }));

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    let ready = false;

    const timeout = setTimeout(() => {
      if (!ready && !cancelled) emitError("Không tải được trình phát Bunny. Token có thể đã hết hạn — hãy mở lại bài.");
    }, READY_TIMEOUT_MS);

    import("player.js")
      .then(({ default: playerjs }) => {
        if (cancelled) return;
        const player = new playerjs.Player(iframe);
        playerRef.current = player;
        player.on("ready", () => {
          ready = true;
          clearTimeout(timeout);
          const start = getStartAt();
          if (start > 0) {
            player.setCurrentTime(start);
            lastTime.current = start;
          }
          player.getDuration((d) => emitReady(Number.isFinite(d) && d > 0 ? d : 0));
          player.on("timeupdate", ({ seconds }) => {
            lastTime.current = seconds;
            emitTime(seconds);
          });
          player.on("play", () => emitPlay());
          player.on("pause", () => emitPause(lastTime.current));
          player.on("ended", () => emitEnded());
          player.on("error", () => emitError("Không phát được video Bunny."));
        });
      })
      .catch(() => emitError("Không tải được trình điều khiển trình phát."));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      playerRef.current = null;
    };
  }, [embedUrl]);

  return (
    <iframe
      ref={iframeRef}
      // Mỗi URL là 1 trình phát riêng (Player.js phân biệt theo src)
      key={embedUrl}
      src={embedUrl}
      title={title ?? "Video bài học"}
      className="size-full border-0"
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
