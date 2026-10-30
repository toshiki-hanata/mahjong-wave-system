import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit-log";
import { lockBusinessStore, requireOpenBusinessDay } from "@/features/business-days/business-day-service";
import { checkInVisitInTransaction } from "@/features/visits/visit-service";

export const staffParticipationInputSchema = z.object({ participantStaffId: z.string().min(1).max(200), requestKey: z.uuid() });
export class StaffParticipantUnavailableError extends Error {}
export class StaffParticipationConflictError extends Error {}

export async function checkInStaffParticipant(
  database: Pick<PrismaClient, "$transaction">,
  raw: z.infer<typeof staffParticipationInputSchema>,
  context: { storeId: string; staffId: string },
) {
  const input = staffParticipationInputSchema.parse(raw);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const staffRows = await tx.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
      SELECT "id", "name", "isActive" FROM "Staff"
      WHERE "storeId" = ${context.storeId} AND "id" IN (${Prisma.join([...new Set([context.staffId, input.participantStaffId])].sort())})
      ORDER BY "id" FOR UPDATE
    `;
    const actor = staffRows.find((staff) => staff.id === context.staffId);
    const participant = staffRows.find((staff) => staff.id === input.participantStaffId);
    if (!actor?.isActive || !participant?.isActive) throw new StaffParticipantUnavailableError();
    const replay = await tx.auditLog.findFirst({ where: {
      storeId: context.storeId, action: "STAFF_PARTICIPATION_CHECK_IN",
      metadata: { path: ["requestKey"], equals: input.requestKey },
    }, select: { metadata: true } });
    if (replay) {
      const metadata = replay.metadata as { participantStaffId?: string; visitId?: string } | null;
      if (metadata?.participantStaffId !== input.participantStaffId || !metadata.visitId) throw new StaffParticipationConflictError();
      return { visitId: metadata.visitId, replayed: true };
    }
    const day = await requireOpenBusinessDay(tx, context.storeId);
    let profile = await tx.customer.findFirst({ where: { storeId: context.storeId, participantStaffId: participant.id }, select: { id: true, isActive: true, internalName: true } });
    const profileCreated = !profile;
    if (!profile) {
      profile = await tx.customer.create({ data: {
        id: `staff-player-${participant.id}`, storeId: context.storeId,
        customerCode: `STAFF-${participant.id}`, internalName: participant.name,
        participantStaffId: participant.id,
      }, select: { id: true, isActive: true, internalName: true } });
    } else {
      if (!profile.isActive) throw new StaffParticipantUnavailableError();
      if (profile.internalName !== participant.name) await tx.customer.update({ where: { id: profile.id }, data: { internalName: participant.name } });
    }
    const current = await tx.visit.findFirst({
      where: { storeId: context.storeId, customerId: profile.id, status: { in: ["WAITING", "PLAYING"] } },
      select: { id: true, businessDayId: true },
    });
    if (current && current.businessDayId !== day.id) throw new StaffParticipationConflictError();
    const visitId = current?.id ?? await checkInVisitInTransaction(tx, profile.id, context, { allowStaffParticipant: true });
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId,
      action: "STAFF_PARTICIPATION_CHECK_IN", entityType: "Staff", entityId: participant.id,
      metadata: { requestKey: input.requestKey, participantStaffId: participant.id, visitId, businessDayId: day.id, profileCreated, reusedVisit: Boolean(current) },
    }, tx);
    return { visitId, replayed: Boolean(current) };
  }, { maxWait: 10_000, timeout: 30_000 });
}
