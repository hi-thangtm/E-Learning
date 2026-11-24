"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video-player/video-player";
import type { LessonCompletion, LessonDetail } from "@/lib/learning";
import { VIDEO_SEEK_TOLERANCE } from "@/lib/learning-sequence";
import { useLessonShell } from "./lesson-shell";

type VideoDetail = Extract<LessonDetail, { type: "VIDEO" }>;

const PROGRESS_URL = "/api/learn/progress";
const SEND_EVERY_MS = 10_000;
/** Bước thời gian tối đa giữa 2 lần cập nhật vẫn coi là “đang phát liên tục” (YouTube báo mỗi 1 giây, tốc độ tối đa 2x) */
const CONTINUOUS_STEP = 3;

/** Bài VIDEO (feature-spec 2.4, Quy tắc 4): nhớ vị trí, chống tua vượt phần chưa xem, tự hoàn thành khi xem đủ %. */
export function VideoLesson({
  lesson,
  initial,
}: {
  lesson: VideoDetail;
  initial: { lastPositionSeconds: number; maxWatchedSeconds: number };
}) {
  const { mode } = useLessonShell();

  if (lesson.unavailable || !lesson.provider || !lesson.videoId) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md bg-card text-center shadow-sm">
        <TriangleAlert className="size-10 text-warning" />
        <p className="text-[15px] text-muted-foreground">{lesson.unavailable ?? "Bài học chưa có video."}</p>
      </div>
    );
  }

  if (mode === "preview") return <PreviewVideo lesson={lesson} provider={lesson.provider} videoId={lesson.videoId} />;

  return <TrackedVideo lesson={lesson} provider={lesson.provider} videoId={lesson.videoId} initial={initial} />;
}

/** Học viên không sửa được video → chỉ báo chung; câu kỹ thuật (chế độ nhúng…) chỉ hiện ở chế độ xem trước (ui-review #11). */
const LEARNER_VIDEO_ERROR = "Video tạm thời không phát được. Vui lòng báo quản trị đào tạo.";

function PreviewVideo({ lesson, provider, videoId }: { lesson: VideoDetail; provider: "YOUTUBE" | "BUNNY"; videoId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <VideoPlayer provider={provider} videoId={videoId} embedUrl={lesson.embedUrl} title={lesson.title} onError={setError} onPlay={() => setError(null)} />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/16 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <p className="text-[13px] text-muted-foreground">
        Xem trước: tua tự do, không ghi tiến độ. Học viên cần xem {lesson.minWatchPercent}% để hoàn thành bài.
      </p>
    </div>
  );
}

function TrackedVideo({
  lesson,
  provider,
  videoId,
  initial,
}: {
  lesson: VideoDetail;
  provider: "YOUTUBE" | "BUNNY";
  videoId: string;
  initial: { lastPositionSeconds: number; maxWatchedSeconds: number };
}) {
  const { completed, onLessonCompleted } = useLessonShell();
  const duration = lesson.durationSeconds ?? 0;
  const requiredSeconds = (duration * lesson.minWatchPercent) / 100;

  // Mở lại đúng chỗ (chưa xong: không quá phần đã xem thật); gần hết video thì xem lại từ đầu
  const resumeAt = completed ? initial.lastPositionSeconds : Math.min(initial.lastPositionSeconds, initial.maxWatchedSeconds);
  const [startAt] = useState(resumeAt >= duration - 3 ? 0 : resumeAt);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const maxRef = useRef(initial.maxWatchedSeconds);
  const posRef = useRef(startAt);
  const lastTimeRef = useRef(startAt);
  const playingRef = useRef(false);
  const completedRef = useRef(completed);
  const thresholdSentRef = useRef(false);
  const sentKeyRef = useRef(keyOf(startAt, initial.maxWatchedSeconds));
  const [watched, setWatched] = useState(initial.maxWatchedSeconds);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  function payload() {
    const position = round1(posRef.current);
    const w = round1(maxRef.current);
    return { body: JSON.stringify({ lessonId: lesson.id, position, watched: w }), key: keyOf(position, w) };
  }

  /** Gửi tiến độ thường (fetch) — đọc kết quả để cập nhật ✓ / mở khoá bài sau. */
  async function send() {
    const { body, key } = payload();
    if (key === sentKeyRef.current) return;
    sentKeyRef.current = key;
    try {
      const res = await fetch(PROGRESS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      if (!res.ok) return;
      const data = (await res.json()) as { completion: LessonCompletion | null };
      if (data.completion) onLessonCompleted(data.completion);
    } catch {
      // Mất mạng: lần gửi sau sẽ gửi lại số mới nhất
      sentKeyRef.current = "";
    }
  }

  /** Rời trang: sendBeacon (trình duyệt vẫn gửi dù trang đang đóng). */
  function beacon() {
    const { body, key } = payload();
    if (key === sentKeyRef.current) return;
    sentKeyRef.current = key;
    navigator.sendBeacon(PROGRESS_URL, new Blob([body], { type: "text/plain;charset=UTF-8" }));
  }

  function handleTime(t: number) {
    const max = maxRef.current;
    // Tua vượt phần chưa xem → kéo về (bài đã xong thì tua tự do)
    if (!completedRef.current && t > max + VIDEO_SEEK_TOLERANCE) {
      playerRef.current?.seekTo(max);
      posRef.current = max;
      lastTimeRef.current = max;
      toast.warning("Bạn cần xem hết phần trước", { id: "video-seek-blocked" });
      return;
    }
    // Chỉ tính là “đã xem” khi phát liên tục
    const step = t - lastTimeRef.current;
    if (t > max && step > 0 && step <= CONTINUOUS_STEP) {
      maxRef.current = t;
      if (Math.floor(t) !== Math.floor(max)) setWatched(t);
      if (!completedRef.current && !thresholdSentRef.current && t + 1 >= requiredSeconds) {
        thresholdSentRef.current = true;
        void send();
      }
    }
    lastTimeRef.current = t;
    posRef.current = t;
  }

  const tick = useEffectEvent(() => {
    if (playingRef.current) void send();
  });
  const leave = useEffectEvent(() => beacon());

  useEffect(() => {
    const id = setInterval(() => tick(), SEND_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    const onPageHide = () => leave();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      leave(); // chuyển sang bài khác trong app
    };
  }, []);

  const watchedPercent = duration ? Math.min(100, Math.floor((watched / duration) * 100)) : 0;

  return (
    <div className="space-y-3">
      <VideoPlayer
        ref={playerRef}
        provider={provider}
        videoId={videoId}
        embedUrl={lesson.embedUrl}
        title={lesson.title}
        startAt={startAt}
        onTimeUpdate={handleTime}
        onPlay={() => {
          playingRef.current = true;
          setError(null);
        }}
        onPause={() => {
          playingRef.current = false;
          void send();
        }}
        onEnded={() => {
          playingRef.current = false;
          void send();
        }}
        onError={() => setError(LEARNER_VIDEO_ERROR)}
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/16 px-4 py-2.5 text-[13px] text-destructive">
          {error}
        </p>
      )}
      {completed ? (
        <p className="flex items-center gap-2 text-[15px] text-success">
          <CheckCircle2 className="size-5" />
          Đã hoàn thành bài này — bạn có thể tua tự do để xem lại.
        </p>
      ) : (
        <p className="text-[15px] text-muted-foreground">
          Đã xem <span className="font-medium text-foreground tabular-nums">{watchedPercent}%</span> · cần{" "}
          <span className="font-medium text-foreground">{lesson.minWatchPercent}%</span> để hoàn thành. Không tua vượt quá phần chưa xem.
        </p>
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const keyOf = (position: number, watched: number) => `${Math.round(position)}|${Math.floor(watched)}`;
