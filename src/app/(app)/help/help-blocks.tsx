import { Info, TriangleAlert } from "lucide-react";
import type { HelpBlock } from "@/lib/help";
import { HelpShot } from "./help-shot";
import { RichText } from "./rich-text";

/** Hiển thị các khối nội dung của 1 mục hướng dẫn. */
export function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Block({ block: b }: { block: HelpBlock }) {
  switch (b.type) {
    case "p":
      return (
        <p>
          <RichText text={b.text} />
        </p>
      );
    case "steps":
      return (
        <ol className="space-y-2.5">
          {b.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/16 text-[13px] font-medium text-primary"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="sr-only">Bước {i + 1}: </span>
                <RichText text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
          {b.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <p className="flex items-start gap-2.5 rounded-md bg-info/16 px-4 py-3 text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">Mẹo: </span>
            <RichText text={b.text} />
          </span>
        </p>
      );
    case "warn":
      return (
        <p className="flex items-start gap-2.5 rounded-md bg-warning/16 px-4 py-3 text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">Lưu ý: </span>
            <RichText text={b.text} />
          </span>
        </p>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {b.head.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 font-medium text-foreground sm:px-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="border-b border-border last:border-0 align-top">
                  {row.map((cell, c) => (
                    <td key={c} className={c === 0 ? "min-w-[100px] px-3 py-2.5 font-medium text-foreground sm:px-4" : "min-w-[140px] px-3 py-2.5 sm:px-4"}>
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "shot":
      return <HelpShot name={b.name} caption={b.caption} className="mx-auto" />;
    case "shots":
      return (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {b.items.map((s) => (
            <HelpShot key={s.name} name={s.name} caption={s.caption} />
          ))}
        </div>
      );
  }
}
