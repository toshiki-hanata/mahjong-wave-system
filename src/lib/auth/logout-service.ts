import "server-only";
import { applicationSqlTable } from "@/lib/security/sql-namespace";
import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";

/** Compare the cookie version atomically, so replaying an old logout cannot revoke a later login. */
export async function revokeLogoutSession(database: Pick<PrismaClient, "$transaction">, session: { staffId: string; storeId: string; sessionVersion: number }): Promise<boolean> {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM ${applicationSqlTable("Store")} WHERE "id" = ${session.storeId} FOR UPDATE`;
    const changed = await tx.staff.updateMany({
      where: { id: session.staffId, storeId: session.storeId, sessionVersion: session.sessionVersion },
      data: { sessionVersion: { increment: 1 } },
    });
    if (changed.count !== 1) return false;
    await recordAuditLog({ storeId: session.storeId, actorStaffId: session.staffId, action: "STAFF_LOGOUT_ALL", entityType: "Staff", entityId: session.staffId, metadata: { scope: "all-sessions" } }, tx);
    return true;
  });
}
