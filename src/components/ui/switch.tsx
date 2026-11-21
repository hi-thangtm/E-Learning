"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

/**
 * Công tắc bật / tắt (Base UI Switch) — kiểu Vuexy: nền xám khi tắt, primary khi bật.
 * Dùng trong form: truyền `name` để gửi giá trị "on" khi bật (Base UI tự tạo input ẩn).
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-checked:shadow-primary-sm",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-card shadow-xs transition-transform data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
