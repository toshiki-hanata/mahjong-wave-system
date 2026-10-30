import "server-only";

import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "./password";
import { recordAuditLog } from "@/lib/audit-log";
import { lockBusinessStore } from "@/features/business-days/business-day-service";

type Database = Pick<PrismaClient, "$transaction">;
type StaffSecurityContext = { storeId: string; actorStaffId: string };

/** Staff deactivation (and reactivation) invalidates all previously issued cookies. */
export async function setStaffActive(database: Database, staffId: string, isActive: boolean, context: StaffSecurityContext): Promise<boolean> {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const staff = await tx.staff.findFirst({ where: { id: staffId, storeId: context.storeId }, select: { isActive: true } });
    if (!staff || staff.isActive === isActive) return false;
    const updated = await tx.staff.updateMany({
      where: { id: staffId, storeId: context.storeId, isActive: staff.isActive },
      data: { isActive, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return false;
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.actorStaffId,
      action: isActive ? "STAFF_ACTIVATE" : "STAFF_DEACTIVATE",
      entityType: "Staff", entityId: staffId, metadata: { sessionsRevoked: true },
    }, tx);
    return true;
  });
}

/** Invalidates every signed cookie issued to this staff member. */
export async function revokeStaffSessions(database: Database, staffId: string, context: StaffSecurityContext): Promise<boolean> {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const updated = await tx.staff.updateMany({
      where: { id: staffId, storeId: context.storeId },
      data: { sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return false;
    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.actorStaffId,
      action: "STAFF_SESSION_REVOKE",
      entityType: "Staff",
      entityId: staffId,
      metadata: { scope: "all-sessions" },
    }, tx);
    return true;
  });
}

/** Password changes also invalidate every previously issued cookie. */
export async function changeStaffPassword(
  database: Database,
  staffId: string,
  password: string,
  context: StaffSecurityContext,
): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const updated = await tx.staff.updateMany({
      where: { id: staffId, storeId: context.storeId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return false;
    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.actorStaffId,
      action: "STAFF_PASSWORD_CHANGE",
      entityType: "Staff",
      entityId: staffId,
      metadata: { sessionsRevoked: true },
    }, tx);
    return true;
  });
}
