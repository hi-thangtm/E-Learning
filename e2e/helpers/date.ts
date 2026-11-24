import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Chọn ngày trong ô chọn ngày riêng (src/components/date-picker.tsx — ui-review #70):
 * mở lịch → chọn năm, tháng ở 2 ô “Chọn năm / Chọn tháng” → bấm ô ngày `data-day="yyyy-MM-dd"`.
 */
export async function pickDate(page: Page, trigger: Locator, iso: string) {
  await trigger.click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  const [year, month] = iso.split("-").map(Number);
  await popover.getByLabel("Chọn năm").selectOption(String(year));
  await popover.getByLabel("Chọn tháng").selectOption(String(month - 1));
  await popover.locator(`td[data-day="${iso}"]:not([data-outside]) button`).click();
  await expect(popover).toBeHidden();
}
