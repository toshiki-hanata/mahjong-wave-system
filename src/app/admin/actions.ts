"use server";

import { redirect } from "next/navigation";
import { destroyAdminSession, readAdminSession } from "@/lib/auth/session";
import { parseAdminSession } from "@/lib/auth/session-data";
import { isStaffSessionFresh } from "@/lib/auth/session-policy";
import { revokeLogoutSession } from "@/lib/auth/logout-service";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security/security-log";

export async function logoutAction(): Promise<never> {
  let failed = false;
  try {
    const session = await readAdminSession();
    const parsed = session && parseAdminSession(session);
    if (parsed?.success && isStaffSessionFresh(parsed.data)) {
      if (!prisma) throw new Error("Logout revocation unavailable");
      if (await revokeLogoutSession(prisma, parsed.data)) logSecurityEvent("LOGOUT_REVOKED", "info");
    }
  } catch {
    failed = true; logSecurityEvent("LOGOUT_ERROR", "error");
  } finally {
    await destroyAdminSession();
  }
  redirect(failed ? "/admin/login?reason=logout-incomplete" : "/admin/login");
}
