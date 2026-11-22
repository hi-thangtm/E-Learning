import { getCurrentUser } from "@/lib/current-user";
import { getUnreadCount } from "@/lib/notifications";

/** Số thông báo chưa đọc của người đang đăng nhập — chuông trên header hỏi mỗi 60 giây. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ unread: await getUnreadCount(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
