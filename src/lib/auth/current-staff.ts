import "server-only";
import { hasMfaProof, requiresStaffMfa } from "./mfa/policy";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readAdminSession } from "./session";
import { isSessionVersionCurrent, parseAdminSession } from "./session-data";
import { hasAnyRole } from "./authorization";
import { isStaffSessionFresh } from "./session-policy";
import { logSecurityEvent } from "@/lib/security/security-log";

export type CurrentStaff = {
  id: string;
  storeId: string;
  name: string;
  storeName: string;
  storeTimezone: string;
  role: Role;
  sessionVersion: number;
  sessionIssuedAt: number;
  sessionLastActiveAt: number;
};

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const session = await readAdminSession();
  if (!session) return null;

  const parsed = parseAdminSession({
    staffId: session.staffId,
    storeId: session.storeId,
    role: session.role,
    sessionVersion: session.sessionVersion,
    issuedAt: session.issuedAt,
    lastActiveAt: session.lastActiveAt,
    mfaVerifiedAt: session.mfaVerifiedAt,
    mfaVersion: session.mfaVersion,
  });
  if (!parsed.success || !isStaffSessionFresh(parsed.data) || !prisma) { logSecurityEvent("SESSION_REJECTED"); return null; }

  await assertRuntimeDatabaseRole(prisma);
  const staff = await prisma.staff.findFirst({
    where: { id: parsed.data.staffId, storeId: parsed.data.storeId },
    select: {
      id: true,
      storeId: true,
      name: true,
      role: true,
      isActive: true,
      sessionVersion: true,
      store: { select: { isActive: true, name: true, timezone: true } },
    },
  });

  if (!staff || !staff.isActive || !staff.store.isActive || staff.role !== parsed.data.role || !isSessionVersionCurrent(parsed.data.sessionVersion, staff.sessionVersion)) return null;
  if (requiresStaffMfa(staff.role)) {
    const profile = await prisma.staffMfa.findFirst({ where: { staffId: staff.id, storeId: staff.storeId }, select: { enabledAt: true, secretCiphertext: true, version: true } });
    if (!hasMfaProof(parsed.data, profile)) { logSecurityEvent("SESSION_REJECTED"); return null; }
  }
  return { id: staff.id, storeId: staff.storeId, name: staff.name, storeName: staff.store.name, storeTimezone: staff.store.timezone, role: staff.role, sessionVersion: staff.sessionVersion, sessionIssuedAt: parsed.data.issuedAt, sessionLastActiveAt: parsed.data.lastActiveAt };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");
  return staff;
}

export async function requireRole(allowedRoles: readonly Role[]): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!hasAnyRole(staff.role, allowedRoles)) { logSecurityEvent("AUTHORIZATION_DENIED"); redirect("/admin?error=forbidden"); }
  return staff;
}
