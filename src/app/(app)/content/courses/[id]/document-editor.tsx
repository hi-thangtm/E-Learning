"use client";

import { useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Check,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

const isHttpUrl = (url: string) => /^https?:\/\/[^\s]+$/i.test(url);

/**
 * Trình soạn bài Tài liệu (Tiptap): StarterKit + Underline + Link.
 * Thanh công cụ chỉ có: H2, H3, đậm, nghiêng, gạch chân, danh sách chấm / số, liên kết.
 * HTML được ghi vào ô ẩn `name` để gửi cùng form. Server LỌC LẠI HTML (src/lib/sanitize.ts) trước khi lưu —
 * phần cấu hình ở đây chỉ để người soạn không tạo ra định dạng sẽ bị loại.
 */
export function DocumentEditor({
  name,
  initialHtml,
  disabled,
  invalid,
}: {
  name: string;
  initialHtml: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [html, setHtml] = useState(initialHtml);

  const editor = useEditor({
    // Next.js render phía server trước -> tạo editor sau khi vào trình duyệt để không lệch hydrate
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Không có trên thanh công cụ -> tắt để không tạo ra thẻ server sẽ loại bỏ
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        // StarterKit v3 có sẵn link / underline -> tắt ở đây, thêm riêng bên dưới
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isHttpUrl(url),
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-64 max-h-[50vh] overflow-y-auto px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none",
          "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-medium [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-medium",
          "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_a]:text-primary [&_a]:underline",
        ),
        "aria-label": "Nội dung bài tài liệu",
      },
    },
    onUpdate: ({ editor }) => setHtml(editor.isEmpty ? "" : editor.getHTML()),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-primary-sm",
        invalid && "border-destructive",
        disabled && "bg-muted",
      )}
    >
      <input type="hidden" name={name} value={html} />
      {editor && !disabled && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!editor && <div className="min-h-64 px-4 py-3 text-muted-foreground">Đang tải trình soạn thảo...</div>}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  function openLink() {
    setUrl(state.href || "https://");
    setUrlError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    const value = url.trim();
    if (!isHttpUrl(value)) {
      setUrlError("Liên kết phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setLinkOpen(false);
  }

  const chain = () => editor.chain().focus();

  return (
    <div className="border-b border-border bg-muted/40">
      <div role="toolbar" aria-label="Định dạng" className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <ToolButton label="Tiêu đề lớn (H2)" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </ToolButton>
        <ToolButton label="Tiêu đề nhỏ (H3)" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 />
        </ToolButton>
        <Divider />
        <ToolButton label="Đậm (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold />
        </ToolButton>
        <ToolButton label="Nghiêng (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic />
        </ToolButton>
        <ToolButton label="Gạch chân (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
          <UnderlineIcon />
        </ToolButton>
        <Divider />
        <ToolButton label="Danh sách chấm" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List />
        </ToolButton>
        <ToolButton label="Danh sách số" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolButton>
        <Divider />
        <ToolButton label="Chèn / sửa liên kết" active={state.link || linkOpen} onClick={openLink}>
          <Link2 />
        </ToolButton>
        {state.link && (
          <ToolButton label="Bỏ liên kết" active={false} onClick={() => chain().extendMarkRange("link").unsetLink().run()}>
            <Link2Off />
          </ToolButton>
        )}
      </div>

      {linkOpen && (
        <div className="flex items-start gap-2 border-t border-border px-3 py-2">
          <div className="grid flex-1 gap-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  setLinkOpen(false);
                }
              }}
              placeholder="https://..."
              aria-label="Địa chỉ liên kết"
              aria-invalid={!!urlError}
              autoFocus
              className="h-[30px] text-[13px]"
            />
            {urlError && <p className="text-[13px] text-destructive">{urlError}</p>}
          </div>
          <Button type="button" size="sm" onClick={applyLink}>
            <Check />
            Áp dụng
          </Button>
          <Tooltip label="Huỷ"><Button type="button" size="icon-sm" variant="ghost" aria-label="Huỷ" onClick={() => setLinkOpen(false)}>
            <X />
          </Button></Tooltip>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Giữ vùng chọn trong trình soạn khi bấm nút
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px]",
        active && "bg-primary/16 text-primary hover:bg-primary/16 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}
