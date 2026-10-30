import "server-only";

import { Prisma, TableSessionStatus, VisitStatus, type PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { lockAndValidateVisitsForTableInTransaction, transitionVisitsForTableInTransaction } from "@/features/visits/visit-service";
import { lockBusinessStore, requireOpenBusinessDay } from "@/features/business-days/business-day-service";

type Database = Pick<PrismaClient, "$transaction">;
type Context = { storeId: string; staffId: string };
type SeatInput = { visitId: string; position: number };

export class TableNotAvailableError extends Error { constructor() { super("Table is unavailable."); this.name = "TableNotAvailableError"; } }
export class TableSessionConflictError extends Error { constructor() { super("Table or Visit is already in use."); this.name = "TableSessionConflictError"; } }
export class TableSessionNotFoundError extends Error { constructor() { super("Active table session was not found."); this.name = "TableSessionNotFoundError"; } }
export class TableHasActiveSessionError extends Error { constructor() { super("Table has an active session."); this.name = "TableHasActiveSessionError"; } }
export class InvalidSeatAssignmentError extends Error { constructor() { super("Exactly four distinct Visits and positions 1 through 4 are required."); this.name = "InvalidSeatAssignmentError"; } }
export class InvalidTableSessionStateError extends Error { constructor() { super("Table session is not in a valid state."); this.name = "InvalidTableSessionStateError"; } }
export class StoreRuleUnavailableError extends Error { constructor() { super("An active store rule is required to start a table session."); this.name = "StoreRuleUnavailableError"; } }

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function assertSeatAssignment(seats: SeatInput[]) {
  if (seats.length !== 4 || new Set(seats.map((seat) => seat.visitId)).size !== 4
    || new Set(seats.map((seat) => seat.position)).size !== 4
    || seats.some((seat) => !Number.isInteger(seat.position) || seat.position < 1 || seat.position > 4)
    || ![1, 2, 3, 4].every((position) => seats.some((seat) => seat.position === position))) {
    throw new InvalidSeatAssignmentError();
  }
}

export async function startTableSession(database: Database, tableId: string, seats: SeatInput[], context: Context): Promise<string> {
  assertSeatAssignment(seats);
  try {
    return await database.$transaction(async (tx) => {
      const businessDay = await requireOpenBusinessDay(tx, context.storeId);
      const lockedTable = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "MahjongTable"
        WHERE "id" = ${tableId} AND "storeId" = ${context.storeId} AND "isActive" = true
        FOR UPDATE
      `;
      if (!lockedTable.length) throw new TableNotAvailableError();

      const storeRule = await tx.storeRule.findFirst({ where: { storeId: context.storeId, isActive: true }, orderBy: { version: "desc" }, select: { id: true } });
      if (!storeRule) throw new StoreRuleUnavailableError();

      const visitIds = seats.map((seat) => seat.visitId);
      await lockAndValidateVisitsForTableInTransaction(tx, visitIds, context, VisitStatus.WAITING, true);
      const dayVisits = await tx.visit.count({ where: { id: { in: visitIds }, storeId: context.storeId, businessDayId: businessDay.id } });
      if (dayVisits !== 4) throw new InvalidTableSessionStateError();
      const session = await tx.tableSession.create({
        data: { storeId: context.storeId, businessDayId: businessDay.id, mahjongTableId: tableId, storeRuleId: storeRule.id, status: TableSessionStatus.ACTIVE },
        select: { id: true },
      });
      await tx.tableSeat.createMany({
        data: seats.map((seat) => ({
          storeId: context.storeId,
          tableSessionId: session.id,
          visitId: seat.visitId,
          position: seat.position,
        })),
      });
      await transitionVisitsForTableInTransaction(tx, visitIds, context, VisitStatus.WAITING, VisitStatus.PLAYING);
      await recordAuditLog({
        storeId: context.storeId,
        actorStaffId: context.staffId,
        action: "TABLE_SESSION_START",
        entityType: "TableSession",
        entityId: session.id,
        metadata: { tableId, storeRuleId: storeRule.id, seats: [...seats].sort((a, b) => a.position - b.position) },
      }, tx);
      return session.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TableSessionConflictError();
    throw error;
  }
}

export async function endTableSession(database: Database, sessionId: string, context: Context): Promise<void> {
  await database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const sessions = await tx.$queryRaw<Array<{ id: string; status: TableSessionStatus }>>`
      SELECT "id", "status" FROM "TableSession"
      WHERE "id" = ${sessionId} AND "storeId" = ${context.storeId}
      FOR UPDATE
    `;
    const session = sessions[0];
    if (!session) throw new TableSessionNotFoundError();
    if (session.status !== TableSessionStatus.ACTIVE) throw new InvalidTableSessionStateError();

    const activeSeats = await tx.tableSeat.findMany({
      where: { storeId: context.storeId, tableSessionId: sessionId, removedAt: null },
      select: { id: true, visitId: true, position: true },
    });
    if (activeSeats.length !== 4 || new Set(activeSeats.map((seat) => seat.position)).size !== 4) {
      throw new InvalidTableSessionStateError();
    }
    await transitionVisitsForTableInTransaction(
      tx,
      activeSeats.map((seat) => seat.visitId),
      context,
      VisitStatus.PLAYING,
      VisitStatus.WAITING,
    );

    const now = new Date();
    await tx.tableSeat.updateMany({
      where: { storeId: context.storeId, tableSessionId: sessionId, removedAt: null },
      data: { removedAt: now },
    });
    const updated = await tx.tableSession.updateMany({
      where: { id: sessionId, storeId: context.storeId, status: TableSessionStatus.ACTIVE },
      data: { status: TableSessionStatus.ENDED, endedAt: now },
    });
    if (updated.count !== 1) throw new InvalidTableSessionStateError();
    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.staffId,
      action: "TABLE_SESSION_END",
      entityType: "TableSession",
      entityId: sessionId,
      metadata: { seats: activeSeats.map(({ visitId, position }) => ({ visitId, position })).sort((a, b) => a.position - b.position) },
    }, tx);
  });
}

export async function createTable(database: Database, input: { name: string; sortOrder: number }, context: Context): Promise<string> {
  return database.$transaction(async (tx) => {
    const table = await tx.mahjongTable.create({ data: { ...input, storeId: context.storeId }, select: { id: true } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "TABLE_CREATE", entityType: "MahjongTable", entityId: table.id, metadata: input }, tx);
    return table.id;
  });
}

export async function updateTable(database: Database, input: { tableId: string; name: string; sortOrder: number }, context: Context): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const existing = await tx.mahjongTable.findFirst({ where: { id: input.tableId, storeId: context.storeId }, select: { id: true, name: true, sortOrder: true, isActive: true } });
    if (!existing) return false;
    await tx.mahjongTable.update({ where: { id: existing.id }, data: { name: input.name, sortOrder: input.sortOrder } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "TABLE_UPDATE", entityType: "MahjongTable", entityId: existing.id, metadata: { before: { name: existing.name, sortOrder: existing.sortOrder }, after: { name: input.name, sortOrder: input.sortOrder } } }, tx);
    return true;
  });
}

export async function deactivateTable(database: Database, tableId: string, context: Context): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MahjongTable" WHERE "id" = ${tableId} AND "storeId" = ${context.storeId} AND "isActive" = true FOR UPDATE
    `;
    if (!rows.length) return false;
    const activeSession = await tx.tableSession.findFirst({ where: { storeId: context.storeId, mahjongTableId: tableId, status: TableSessionStatus.ACTIVE }, select: { id: true } });
    if (activeSession) throw new TableHasActiveSessionError();
    await tx.mahjongTable.update({ where: { id: tableId }, data: { isActive: false } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "TABLE_DEACTIVATE", entityType: "MahjongTable", entityId: tableId }, tx);
    return true;
  });
}
