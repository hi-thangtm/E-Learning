import "next-auth";
import "next-auth/jwt";

/** Thời điểm cấp phiên (ms) — so với users.sessionsValidAfter để huỷ phiên cũ (Việc 29A). */
declare module "next-auth" {
  interface Session {
    authAt: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authAt?: number;
  }
}
