"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Panel trượt từ cạnh màn hình (dựa trên Dialog của Base UI, cùng kiểu với dialog.tsx).
 * Mặc định mở bên phải, rộng 480px — theo Drawer của Vuexy (AddUserDrawer).
 */

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

const SIDE_CLASSES = {
  right:
    "inset-y-0 right-0 h-full w-full sm:max-w-[480px] data-open:slide-in-from-right data-closed:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-full sm:max-w-[480px] data-open:slide-in-from-left data-closed:slide-out-to-left",
} as const

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: keyof typeof SIDE_CLASSES
  showCloseButton?: boolean
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-popover text-[15px] text-popover-foreground shadow-xl duration-200 outline-none data-open:animate-in data-closed:animate-out",
          SIDE_CLASSES[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-5 right-5" />}
          >
            <XIcon />
            <span className="sr-only">Đóng</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 border-b border-border p-6 pr-14", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto p-6", className)} {...props} />
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-lg leading-snug font-medium text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-[15px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetOverlay, SheetTitle, SheetTrigger }
