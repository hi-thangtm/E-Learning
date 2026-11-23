"use client"

import type { ComponentProps, ReactElement, ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

/**
 * Tooltip (Base UI) — hiện khi di chuột VÀ khi focus bằng phím Tab. Dùng cho nút chỉ có icon (kèm aria-label).
 * `children` là phần tử kích hoạt (Button) — Tooltip gắn sự kiện vào nó. Props / ref truyền thêm vào Tooltip được chuyển xuống
 * phần tử con → dùng được làm `render` / `trigger` của menu, dialog: `render={<Tooltip label="…"><Button size="icon" /></Tooltip>}`.
 *
 *   <Tooltip label="Sửa"><Button size="icon-sm" aria-label="Sửa chức danh NV"><Pencil /></Button></Tooltip>
 */
function Tooltip({
  label,
  children,
  side = "top",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: ReactNode
  children: ReactElement
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={300} render={children} {...props} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-50">
          <TooltipPrimitive.Popup
            data-slot="tooltip"
            className="max-w-xs rounded-sm bg-foreground px-2.5 py-1 text-[13px] leading-5 text-background shadow-md transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip }
