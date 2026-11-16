import "server-only";
import type { PrismaClient } from "@prisma/client";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { recordAuditLog } from "@/lib/audit-log";

export const STAFF_ACTION_POLICY = Object.freeze({ maximum: 60, windowMs: 60000 });
export class StaffActionIdentityError extends Error {}
type Actor = { id: string; storeId: string; role: string; sessionVersion: number };

/** Shared PostgreSQL limit, not an in-memory counter. All writers take the store lock first. */
export async function reserveStaffAction(database: Pick<PrismaClient, "$transaction">, actor: Actor, maximum: number = STAFF_ACTION_POLICY.maximum): Promise<boolean> {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > STAFF_ACTION_POLICY.maximum) throw new Error("Invalid action policy");
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, actor.storeId);
    const staff = await tx.staff.findFirst({ where: { id: actor.id, storeId: actor.storeId, isActive: true }, select: { role: true, sessionVersion: true } });
    if (!staff || staff.role !== actor.role || staff.sessionVersion !== actor.sessionVersion) throw new StaffActionIdentityError();
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    if (!rows[0]?.now) throw new Error("Action clock unavailable");
    const count = await tx.auditLog.count({ where: { storeId: actor.storeId, actorStaffId: actor.id, action: "SECURITY_ACTION_ATTEMPT", createdAt: { gte: new Date(rows[0].now.getTime() - STAFF_ACTION_POLICY.windowMs) } } });
    if (count >= maximum) return false;
    await recordAuditLog({ storeId: actor.storeId, actorStaffId: actor.id, action: "SECURITY_ACTION_ATTEMPT", entityType: "StaffAction", metadata: { windowSeconds: 60 } }, tx);
    return true;
  }, { maxWait: 10000, timeout: 20000 });
}
