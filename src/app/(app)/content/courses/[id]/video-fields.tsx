"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { CircleAlert, CloudUpload, Loader2, Lock, RefreshCw, SquarePlay, Trash2, TriangleAlert, Video, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoPlayer } from "@/components/video-player/video-player";
import { cn } from "@/lib/utils";
import { formatDuration, parseYoutubeId } from "@/lib/youtube";
import type { ContentLesson } from "./content-types";
import {
  cancelBunnyUploadAction,
  checkBunnyStatusAction,
  completeBunnyUploadAction,
  getVideoPlaybackAction,
  prepareBunnyUploadAction,
  removeVideoAction,
  setYoutubeVideoAction,
  type BunnyUpload,
} from "./video-actions";

const POLL_MS = 10_000;
const YT_READY_TIMEOUT_MS = 8_000;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const VIDEO_EXT = ["mp4", "mov", "mkv", "webm"];
const EMBED_HELP = "Video phải để chế độ Không công khai và cho phép nhúng.";

type Source = "YOUTUBE" | "BUNNY";

/**
 * Khu video của dialog bài VIDEO. Video lưu NGAY khi gắn (không cần bấm “Lưu bài học”).
 * - Có video READY: xem trước + Thay / Gỡ. PROCESSING: hỏi Bunny mỗi 10 giây. FAILED: tải lại.
 * - Chưa có / đang thay: chọn nguồn YouTube hoặc Bunny Stream.
 */
export function VideoFields({
  lesson,
  bunnyEnabled,
  readOnly,
}: {
  lesson: ContentLesson;
  bunnyEnabled: boolean;
  readOnly: boolean;
}) {
  const [replacing, setReplacing] = useState(false);
  const [source, setSource] = useState<Source>(lesson.videoProvider ?? (bunnyEnabled ? "BUNNY" : "YOUTUBE"));
  const hasVideo = !!lesson.videoProvider;
  const showChooser = !readOnly && (!hasVideo || replacing || lesson.videoStatus === "FAILED");

  return (
    <div className="grid gap-4">
      {hasVideo && lesson.videoStatus === "READY" && !replacing && (
        <CurrentVideo lesson={lesson} readOnly={readOnly} onReplace={() => setReplacing(true)} />
      )}
      {hasVideo && lesson.videoStatus === "PROCESSING" && <ProcessingVideo lesson={lesson} />}
      {hasVideo && lesson.videoStatus === "FAILED" && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          Bunny không xử lý được video này (file hỏng hoặc không phải video). Hãy tải lại file khác bên dưới.
        </p>
      )}
      {!hasVideo && readOnly && <p className="text-[15px] text-muted-foreground">Bài chưa có video.</p>}

      {showChooser && (
        <div className="grid gap-4 rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium text-foreground">{hasVideo ? "Thay video" : "Chọn nguồn video"}</p>
            {replacing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(false)}>
                <X />
                Giữ video hiện tại
              </Button>
            )}
          </div>
          <div role="radiogroup" aria-label="Nguồn video" className="grid grid-cols-2 gap-4">
            <SourceCard
              selected={source === "BUNNY"}
              disabled={!bunnyEnabled}
              icon={<Video className="size-5" />}
              title="Bunny Stream"
              hint={bunnyEnabled ? "Bảo mật: chỉ người đăng nhập xem được, link hết hạn sau 6 giờ." : "Chưa cấu hình Bunny Stream"}
              onSelect={() => setSource("BUNNY")}
            />
            <SourceCard
              selected={source === "YOUTUBE"}
              icon={<SquarePlay className="size-5" />}
              title="YouTube"
              hint="Dán link video Không công khai."
              onSelect={() => setSource("YOUTUBE")}
            />
          </div>
          {source === "YOUTUBE" ? (
            <YoutubeForm lessonId={lesson.id} onDone={() => setReplacing(false)} />
          ) : bunnyEnabled ? (
            <BunnyUploader lessonId={lesson.id} onDone={() => setReplacing(false)} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function SourceCard({
  selected,
  disabled,
  icon,
  title,
  hint,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground",
        disabled && "cursor-not-allowed opacity-60 hover:border-border",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/60")}>
        {disabled ? <Lock className="size-4" /> : icon}
      </span>
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className={cn("block text-[13px]", disabled ? "text-warning" : "text-muted-foreground")}>{hint}</span>
      </span>
    </button>
  );
}

// --- Video hiện tại (READY) -------------------------------------------------------------------------

function CurrentVideo({ lesson, readOnly, onReplace }: { lesson: ContentLesson; readOnly: boolean; onReplace: () => void }) {
  const router = useRouter();
  const [playback, setPlayback] = useState<{ provider: Source; videoId: string; embedUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // URL phát (Bunny kèm token mới) lấy từ server mỗi lần mở
  useEffect(() => {
    let cancelled = false;
    getVideoPlaybackAction(lesson.id)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setPlayback({ provider: r.provider, videoId: r.videoId, embedUrl: r.embedUrl });
        else setError(r.message);
      })
      .catch(() => !cancelled && setError("Không tải được video."));
    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.videoId]);

  return (
    <div className="grid gap-3">
      {error ? (
        <p className="rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">{error}</p>
      ) : playback ? (
        <VideoPlayer
          className="mx-auto max-w-[640px]"
          provider={playback.provider}
          videoId={playback.videoId}
          embedUrl={playback.embedUrl}
          title={lesson.title}
          onError={setError}
        />
      ) : (
        <div className="mx-auto flex aspect-video w-full max-w-[640px] items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">
          Nguồn: <span className="text-foreground">{lesson.videoProvider === "BUNNY" ? "Bunny Stream" : "YouTube"}</span> · Thời lượng:{" "}
          <span className="text-foreground">{formatDuration(lesson.durationSeconds)}</span>
        </p>
        {!readOnly && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onReplace}>
              <RefreshCw />
              Thay video
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(true)}>
              <Trash2 />
              Gỡ video
            </Button>
          </div>
        )}
      </div>
      {confirmRemove && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirmRemove(false)}
          title="Gỡ video khỏi bài?"
          description={
            lesson.videoProvider === "BUNNY"
              ? "Video sẽ bị XOÁ HẲN trên Bunny Stream. Bài sẽ không có video cho tới khi gắn video mới."
              : "Bài sẽ không còn video YouTube này (video trên YouTube không bị ảnh hưởng)."
          }
          confirmLabel="Gỡ video"
          tone="destructive"
          action={async () => {
            const r = await removeVideoAction(lesson.id);
            if (r.ok) router.refresh();
            return r.ok ? { ok: true, message: "Đã gỡ video." } : { message: r.message };
          }}
        />
      )}
    </div>
  );
}

// --- Bunny đang xử lý: hỏi trạng thái mỗi 10 giây -------------------------------------------------

function ProcessingVideo({ lesson }: { lesson: ContentLesson }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  const poll = useEffectEvent(async () => {
    try {
      const r = await checkBunnyStatusAction(lesson.id);
      if (!r.ok) return;
      setProgress(r.progress);
      if (r.status === "READY") {
        toast.success("Bunny đã xử lý xong video.");
        router.refresh();
      } else if (r.status === "FAILED") {
        toast.error("Bunny không xử lý được video.");
        router.refresh();
      }
    } catch {
      // Lỗi mạng tạm thời -> lần sau hỏi lại
    }
  });

  useEffect(() => {
    // Hỏi lần đầu sau 1 giây, sau đó mỗi 10 giây
    const first = setTimeout(() => void poll(), 1_000);
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [lesson.id]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="font-medium text-foreground">Bunny đang xử lý video...</p>
      <p className="text-[13px] text-muted-foreground">
        {progress > 0 ? `Đã xử lý ${progress}%. ` : ""}Thường mất vài phút tuỳ độ dài video. Có thể đóng hộp thoại, hệ thống vẫn xử lý.
      </p>
    </div>
  );
}

// --- YouTube ------------------------------------------------------------------------------------------

function YoutubeForm({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const videoId = url.trim() ? parseYoutubeId(url) : null;
  const invalid = url.trim() !== "" && !videoId;

  // Không lấy được thời lượng sau vài giây -> coi như video riêng tư / chặn nhúng
  useEffect(() => {
    if (!videoId) return;
    const timer = setTimeout(() => {
      if (durationRef.current <= 0) setPreviewError(EMBED_HELP);
    }, YT_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [videoId]);

  function changeUrl(value: string) {
    setUrl(value);
    setDuration(0);
    durationRef.current = 0;
    setPreviewError(null);
  }

  function save() {
    if (!videoId || duration <= 0) return;
    startSaving(async () => {
      try {
        const r = await setYoutubeVideoAction(lessonId, url, duration);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Đã gắn video YouTube.");
        onDone();
        router.refresh();
      } catch {
        toast.error("Không lưu được video, vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <FormField
        label="Link YouTube"
        htmlFor="youtube-url"
        error={invalid ? "Link YouTube không hợp lệ. VD: https://youtu.be/abc123XYZ_0" : undefined}
      >
        <Input
          id="youtube-url"
          value={url}
          onChange={(e) => changeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/..."
          autoComplete="off"
          aria-invalid={invalid}
        />
      </FormField>
      <p className="flex items-start gap-2 rounded-md bg-warning/16 px-3 py-2 text-[13px] text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        Ai có link YouTube đều xem được. Với quy trình nội bộ, nên dùng Bunny Stream.
      </p>

      {videoId && (
        <>
          <VideoPlayer
            key={videoId}
            className="mx-auto max-w-[640px]"
            provider="YOUTUBE"
            videoId={videoId}
            onReady={(d) => {
              if (d > 0) {
                durationRef.current = d;
                setDuration(d);
                setPreviewError(null);
              } else setPreviewError(EMBED_HELP);
            }}
            onError={(m) => setPreviewError(m)}
          />
          {previewError ? (
            <p className="flex items-start gap-2 text-[13px] text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {previewError}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {duration > 0 ? `Thời lượng: ${formatDuration(duration)}` : "Đang kiểm tra video..."}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={saving || duration <= 0 || !!previewError}>
              {saving ? "Đang lưu..." : "Dùng video này"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Bunny: tải thẳng từ trình duyệt bằng TUS ----------------------------------------------------------

type UploadState = { file: File; sent: number; total: number; upload: tus.Upload; info: BunnyUpload };

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}MB`;

function BunnyUploader({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<UploadState | null>(null);

  // Đang tải mà rời trang -> hỏi lại; đóng hộp thoại -> huỷ tải và xoá video dở trên Bunny
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (active.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      const current = active.current;
      if (current) {
        void current.upload.abort(true);
        void cancelBunnyUploadAction(lessonId, current.info.videoId, current.info.ticket);
        toast.info("Đã huỷ tải video lên.");
      }
    };
  }, [lessonId]);

  async function start(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!VIDEO_EXT.includes(ext)) return setError("Chỉ nhận file video MP4, MOV, MKV hoặc WEBM.");
    if (file.size > MAX_VIDEO_BYTES) return setError("File video tối đa 2GB.");

    setPreparing(true);
    let info: BunnyUpload;
    try {
      const r = await prepareBunnyUploadAction(lessonId, { name: file.name, size: file.size, type: file.type });
      if (!r.ok) return setError(r.message);
      info = r.upload;
    } catch {
      return setError("Không chuẩn bị được việc tải lên, vui lòng thử lại.");
    } finally {
      setPreparing(false);
    }

    const upload = new tus.Upload(file, {
      endpoint: info.endpoint,
      // Mạng chập chờn: tự thử lại và tải tiếp từ chỗ dừng
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000, 60_000],
      chunkSize: 50 * 1024 * 1024,
      storeFingerprintForResuming: false,
      headers: {
        AuthorizationSignature: info.signature,
        AuthorizationExpire: String(info.expire),
        VideoId: info.videoId,
        LibraryId: info.libraryId,
      },
      metadata: { filetype: file.type || "video/mp4", title: info.title },
      onProgress: (sent, total) => {
        setState((s) => (s ? { ...s, sent, total } : s));
      },
      onError: (err) => {
        active.current = null;
        setState(null);
        setError(`Tải lên bị lỗi: ${err.message.split("\n")[0]}. Hãy thử lại.`);
        void cancelBunnyUploadAction(lessonId, info.videoId, info.ticket);
      },
      onSuccess: async () => {
        active.current = null;
        try {
          const r = await completeBunnyUploadAction(lessonId, info.videoId, info.ticket);
          if (!r.ok) {
            setState(null);
            return setError(r.message);
          }
          toast.success("Đã tải video lên. Bunny đang xử lý...");
          setState(null);
          onDone();
          router.refresh();
        } catch {
          setState(null);
          setError("Tải lên xong nhưng không lưu được vào bài. Hãy thử lại.");
        }
      },
    });

    const next: UploadState = { file, sent: 0, total: file.size, upload, info };
    active.current = next;
    setState(next);
    upload.start();
  }

  async function cancel() {
    const current = active.current;
    active.current = null;
    setState(null);
    if (!current) return;
    await current.upload.abort(true);
    await cancelBunnyUploadAction(lessonId, current.info.videoId, current.info.ticket);
    toast.info("Đã huỷ tải video lên.");
  }

  const percent = state && state.total > 0 ? Math.floor((state.sent / state.total) * 100) : 0;

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
        className="sr-only"
        id="bunny-video-file"
        onChange={(e) => start(e.target.files?.[0])}
      />
      {state ? (
        <div className="grid gap-2 rounded-md bg-muted/50 p-4">
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span className="truncate text-foreground">{state.file.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {formatMb(state.sent)} / {formatMb(state.total)} · {percent}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Tiến độ tải video lên"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">Mạng chập chờn sẽ tự tải tiếp. Đừng đóng trang khi đang tải.</p>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={cancel}>
              <X />
              Huỷ
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
          className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-8 text-center transition-colors outline-none hover:border-primary hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {preparing ? <Loader2 className="size-8 animate-spin text-primary" /> : <CloudUpload className="size-8 text-primary" />}
          <span className="font-medium text-foreground">{preparing ? "Đang chuẩn bị..." : "Chọn file video để tải lên"}</span>
          <span className="text-[13px] text-muted-foreground">MP4, MOV, MKV hoặc WEBM, tối đa 2GB. Tải thẳng lên Bunny Stream.</span>
        </button>
      )}
      {error && (
        <p className="flex items-start gap-2 text-[13px] text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
