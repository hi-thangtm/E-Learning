"use client";

import { cn } from "@/lib/utils";
import { BunnyPlayer } from "./bunny-player";
import type { VideoPlayerProps } from "./types";
import { YouTubePlayer } from "./youtube-player";

export type { VideoPlayerHandle, VideoPlayerProps } from "./types";

/**
 * Trình phát video dùng chung cho 2 nguồn (YouTube / Bunny Stream), khung 16:9.
 * Cùng một kiểu sự kiện: onReady(duration), onTimeUpdate(currentTime), onEnded, onError(message);
 * `ref` -> { seekTo(seconds), getCurrentTime() }.
 *
 *   <VideoPlayer provider="BUNNY" videoId={id} embedUrl={url} onReady={(d) => …} ref={playerRef} />
 */
export function VideoPlayer({ provider, videoId, embedUrl, title, className, startAt, ref, ...events }: VideoPlayerProps) {
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-md bg-black", className)}>
      {provider === "YOUTUBE" ? (
        <YouTubePlayer key={videoId} videoId={videoId} title={title} startAt={startAt} ref={ref} {...events} />
      ) : embedUrl ? (
        <BunnyPlayer key={embedUrl} embedUrl={embedUrl} title={title} startAt={startAt} ref={ref} {...events} />
      ) : (
        <div className="flex size-full items-center justify-center text-[13px] text-white/70">Đang chuẩn bị trình phát...</div>
      )}
    </div>
  );
}
