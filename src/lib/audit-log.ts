import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditEvent = {
  storeId: string;
  actorStaffId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type AuditDatabase = Pick<Prisma.TransactionClient, "auditLog">;

export async function recordAuditLog(event: AuditEvent, database?: AuditDatabase): Promise<void> {
  const writer = database ?? prisma;
  if (!writer) throw new Error("DATABASE_URL is required to write audit events.");

  await writer.auditLog.create({
    data: {
      storeId: event.storeId,
      actorStaffId: event.actorStaffId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      metadata: event.metadata,
    },
  });
}
