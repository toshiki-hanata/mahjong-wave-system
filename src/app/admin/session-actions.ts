"use server";

import { getCurrentStaff } from "@/lib/auth/current-staff";
import { touchAdminSession } from "@/lib/auth/session";
import { STAFF_SESSION_POLICY } from "@/lib/auth/session-policy";
import { logSecurityEvent } from "@/lib/security/security-log";

export type SessionActivityResult = { status: "ACTIVE"; idleExpiresAt: number; expiresAt: number } | { status: "EXPIRED" } | { status: "UNAVAILABLE" };

export async function refreshStaffSessionAction(): Promise<SessionActivityResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return { status: "EXPIRED" };
    const touched = await touchAdminSession(staff);
    if (!touched) return { status: "EXPIRED" };
    return { status: "ACTIVE", idleExpiresAt: touched.lastActiveAt + STAFF_SESSION_POLICY.idleMs, expiresAt: touched.issuedAt + STAFF_SESSION_POLICY.absoluteMs };
  } catch {
    logSecurityEvent("SESSION_REFRESH_ERROR", "error");
    return { status: "UNAVAILABLE" };
  }
}
