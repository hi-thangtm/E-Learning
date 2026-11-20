import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/roles";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const user = await requireUser();

  const stats = [
    { label: "Đang học", value: 0 },
    { label: "Đã hoàn thành", value: 0 },
    { label: "Quá hạn", value: 0 },
    { label: "Chứng nhận", value: 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.fullName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {user.employeeCode} · {ROLE_LABELS[user.role]} · {user.company.name}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Số liệu sẽ có khi làm xong phần Giao khoá và Cổng học viên.
      </p>
    </div>
  );
}
