import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/current-user";
import { getSettings } from "@/lib/settings";
import { logoUrl, SETTING_GROUPS } from "@/lib/settings-meta";
import { BunnyCard } from "./bunny-card";
import { SettingsGroupCard } from "./settings-form";

export const metadata: Metadata = { title: "Cài đặt hệ thống" };

/** Cài đặt hệ thống (Việc 28A — feature-spec 6.4) — chỉ Admin tập đoàn. Danh sách khoá: src/lib/settings-meta.ts. */
export default async function SettingsPage() {
  await requireRole(["GROUP_ADMIN"]);
  const values = await getSettings();

  return (
    <>
      <PageHeader title="Cài đặt hệ thống" description="Áp dụng cho toàn tập đoàn. Mọi thay đổi được ghi vào Nhật ký." />
      <div className="grid gap-6">
        {SETTING_GROUPS.map((g) => (
          <SettingsGroupCard
            key={g.id}
            group={g.id}
            title={g.title}
            description={g.description}
            values={values}
            logoUrl={g.id === "branding" ? logoUrl(values.SYSTEM_LOGO_KEY) : undefined}
          />
        ))}
        <BunnyCard />
      </div>
    </>
  );
}
