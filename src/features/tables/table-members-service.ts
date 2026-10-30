import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { lockBusinessStore, requireOpenBusinessDay } from "@/features/business-days/business-day-service";
import { changeTableMembersSchema } from "./table-schemas";
import { seatingToken } from "./seat-snapshot";
import type { z } from "zod";

export class TableMembersChangedError extends Error {}
export class TableMemberUnavailableError extends Error {}

export async function changeTableMembers(database: Pick<PrismaClient, "$transaction">, rawInput: z.infer<typeof changeTableMembersSchema>, context: { storeId: string; staffId: string }) {
  const input = changeTableMembersSchema.parse(rawInput);
  const requestPayload = JSON.stringify(input);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const prior = await tx.auditLog.findFirst({ where: {
      storeId: context.storeId, action: "TABLE_MEMBERS_CHANGE", entityType: "TableSession", entityId: input.sessionId,
      metadata: { path: ["requestKey"], equals: input.requestKey },
    }, select: { metadata: true } });
    if (prior) {
      const metadata = prior.metadata as { requestPayload?: string } | null;
      if (metadata?.requestPayload !== requestPayload) throw new TableMembersChangedError();
      return { replayed: true };
    }
    const day = await requireOpenBusinessDay(tx, context.storeId);
    const sessions = await tx.$queryRaw<Array<{ id: string; businessDayId: string | null; status: string }>>`
      SELECT "id", "businessDayId", "status" FROM "TableSession"
      WHERE "id" = ${input.sessionId} AND "storeId" = ${context.storeId} FOR UPDATE
    `;
    const session = sessions[0];
    if (!session || session.status !== "ACTIVE" || session.businessDayId !== day.id) throw new TableMembersChangedError();
    const seats = await tx.tableSeat.findMany({ where: { storeId: context.storeId, tableSessionId: session.id, removedAt: null }, select: { id: true, visitId: true, position: true }, orderBy: { position: "asc" } });
    const sequence = await tx.game.aggregate({ where: { storeId: context.storeId, tableSessionId: session.id }, _max: { sequenceNumber: true } });
    if (seats.length !== 4 || new Set(seats.map((seat) => seat.position)).size !== 4 || seatingToken(seats) !== input.seatingToken || (sequence._max.sequenceNumber ?? 0) + 1 !== input.expectedSequence) throw new TableMembersChangedError();
    const outgoing = seats.find((seat) => seat.position === input.position);
    if (!outgoing) throw new TableMembersChangedError();
    let after: Array<{ position: number; visitId: string }>;
    if (input.mode === "replace") {
      const incomingVisitId = input.incomingVisitId!;
      if (seats.some((seat) => seat.visitId === incomingVisitId)) throw new TableMemberUnavailableError();
      const visits = await tx.$queryRaw<Array<{ id: string; status: string; businessDayId: string | null; customerIsActive: boolean }>>`
        SELECT v."id", v."status", v."businessDayId", c."isActive" AS "customerIsActive"
        FROM "Visit" v JOIN "Customer" c ON c."id" = v."customerId" AND c."storeId" = v."storeId"
        WHERE v."storeId" = ${context.storeId} AND v."id" IN (${Prisma.join([outgoing.visitId, incomingVisitId])})
        ORDER BY v."id" FOR UPDATE OF v, c
      `;
      const oldVisit = visits.find((visit) => visit.id === outgoing.visitId);
      const incoming = visits.find((visit) => visit.id === incomingVisitId);
      if (oldVisit?.status !== "PLAYING" || oldVisit.businessDayId !== day.id || incoming?.status !== "WAITING" || incoming.businessDayId !== day.id || !incoming.customerIsActive) throw new TableMemberUnavailableError();
      const retired = await tx.tableSeat.updateMany({ where: { id: outgoing.id, storeId: context.storeId, removedAt: null }, data: { removedAt: new Date() } });
      const released = await tx.visit.updateMany({ where: { id: outgoing.visitId, storeId: context.storeId, status: "PLAYING" }, data: { status: "WAITING" } });
      const joined = await tx.visit.updateMany({ where: { id: incomingVisitId, storeId: context.storeId, status: "WAITING" }, data: { status: "PLAYING" } });
      if (retired.count !== 1 || released.count !== 1 || joined.count !== 1) throw new TableMembersChangedError();
      await tx.tableSeat.create({ data: { storeId: context.storeId, tableSessionId: session.id, visitId: incomingVisitId, position: input.position } });
      after = seats.map((seat) => ({ position: seat.position, visitId: seat.id === outgoing.id ? incomingVisitId : seat.visitId }));
    } else {
      const other = seats.find((seat) => seat.position === input.otherPosition);
      if (!other) throw new TableMembersChangedError();
      const retired = await tx.tableSeat.updateMany({ where: { id: { in: [outgoing.id, other.id] }, storeId: context.storeId, removedAt: null }, data: { removedAt: new Date() } });
      if (retired.count !== 2) throw new TableMembersChangedError();
      await tx.tableSeat.createMany({ data: [
        { storeId: context.storeId, tableSessionId: session.id, visitId: outgoing.visitId, position: other.position },
        { storeId: context.storeId, tableSessionId: session.id, visitId: other.visitId, position: outgoing.position },
      ] });
      after = seats.map((seat) => ({ position: seat.position, visitId: seat.id === outgoing.id ? other.visitId : seat.id === other.id ? outgoing.visitId : seat.visitId }));
    }
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "TABLE_MEMBERS_CHANGE", entityType: "TableSession", entityId: session.id, metadata: {
      requestKey: input.requestKey, requestPayload, mode: input.mode,
      before: seats.map(({ position, visitId }) => ({ position, visitId })), after, appliesFromSequence: input.expectedSequence,
    } }, tx);
    return { replayed: false };
  }, { maxWait: 10_000, timeout: 20_000 });
}
