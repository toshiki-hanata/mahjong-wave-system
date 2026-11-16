import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CurrentStaff } from "./current-staff";
import { prisma } from "@/lib/prisma";
import { isSameOriginMutation } from "@/lib/security/mutation-origin";
import { reserveStaffAction, StaffActionIdentityError } from "./staff-action-quota";
import { logSecurityEvent } from "@/lib/security/security-log";

/** Called after authentication and bounded input validation, before business reads or writes. */
export async function requireStaffActionPermit(actor: CurrentStaff): Promise<void> {
  const request = await headers();
  const origin = request.get("origin"), host = request.get("host");
  let sameOrigin = false;
  try { sameOrigin = Boolean(host) && isSameOriginMutation(origin, new URL(origin ?? "").protocol + "//" + host, process.env.APP_ORIGIN || undefined); } catch { /* Reject absent or malformed origins. */ }
  if (!sameOrigin) { logSecurityEvent("AUTHORIZATION_DENIED"); redirect("/admin?error=invalid-origin"); }
  let allowed = false;
  try {
    if (!prisma) throw new Error("Action quota unavailable");
    allowed = await reserveStaffAction(prisma, actor);
  } catch (error) {
    if (error instanceof StaffActionIdentityError) { logSecurityEvent("SESSION_REJECTED"); redirect("/admin/login?reason=session-expired"); }
    logSecurityEvent("ACTION_GUARD_ERROR", "error"); throw new Error("操作の安全確認ができません。時間をおいて再度お試しください。");
  }
  if (!allowed) { logSecurityEvent("ACTION_THROTTLED"); redirect("/admin?error=action-rate-limited"); }
}
