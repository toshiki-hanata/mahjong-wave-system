import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, TableSessionStatus, VisitStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { checkInVisit, checkOutVisit, InvalidVisitTransitionError } from "@/features/visits/visit-service";
import { createTable, deactivateTable, endTableSession, startTableSession, TableHasActiveSessionError, TableSessionConflictError, updateTable } from "./table-service";
import { VisitCustomerUnavailableError } from "@/features/visits/visit-service";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";

const enabled = process.env.RUN_TABLE_DB_TESTS === "true" && Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
const databaseTests = describe.skipIf(!enabled);
const db = new PrismaClient();
let storeId = "";
let staffId = "";
const tableIds: string[] = [];
const customerIds: string[] = [];
const visitIds: string[] = [];
const sessionIds: string[] = [];

databaseTests("table management integration against the development database", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  beforeAll(async () => {
    const owner = await db.staff.findFirst({ where: { role: Role.OWNER, isActive: true, store: { is: { isActive: true } } }, select: { id: true, storeId: true } });
    if (!owner) throw new Error("An active development OWNER is required for table integration tests.");
    storeId = owner.storeId;
    staffId = owner.id;
    for (let index = 0; index < 4; index += 1) {
      tableIds.push(await createTable(db, { name: `TEST TABLE ${randomUUID()}`, sortOrder: index }, { storeId, staffId }));
    }
    for (let index = 0; index < 14; index += 1) {
      const customer = await db.customer.create({ data: { storeId, customerCode: `TTEST-${randomUUID()}`, internalName: `TEST TABLE CUSTOMER ${index + 1}`, note: "Integration fixture; retain inactive." }, select: { id: true } });
      customerIds.push(customer.id);
      visitIds.push(await checkInVisit(db, customer.id, { storeId, staffId }));
    }
    await db.customer.update({ where: { id: customerIds[12] }, data: { isActive: false } });
    await checkOutVisit(db, visitIds[13], { storeId, staffId });
  }, 60_000);

  it("rolls back Session, Seats, Visit states, and AuditLog together when audit write fails", async () => {
    const before = await db.tableSession.count({ where: { storeId, mahjongTableId: tableIds[0] } });
    await expect(startTableSession(db, tableIds[0], [0, 1, 2, 3].map((index) => ({ visitId: visitIds[index], position: index + 1 })), { storeId, staffId: `missing-${randomUUID()}` })).rejects.toBeDefined();
    expect(await db.tableSession.count({ where: { storeId, mahjongTableId: tableIds[0] } })).toBe(before);
    expect(await db.visit.count({ where: { id: { in: visitIds.slice(0, 4) }, status: VisitStatus.WAITING } })).toBe(4);
  }, 30_000);

  it("starts with four distinct WAITING Visits and transitions all four atomically", async () => {
    const seats = [0, 1, 2, 3].map((index) => ({ visitId: visitIds[index], position: index + 1 }));
    const sessionId = await startTableSession(db, tableIds[0], seats, { storeId, staffId });
    sessionIds.push(sessionId);
    expect(await db.tableSession.count({ where: { id: sessionId, storeId, status: TableSessionStatus.ACTIVE } })).toBe(1);
    expect(await db.tableSeat.count({ where: { storeId, tableSessionId: sessionId, removedAt: null } })).toBe(4);
    expect(await db.visit.count({ where: { id: { in: visitIds.slice(0, 4) }, storeId, status: VisitStatus.PLAYING } })).toBe(4);
    expect(await db.auditLog.count({ where: { storeId, action: "TABLE_SESSION_START", entityId: sessionId } })).toBe(1);
  }, 30_000);

  it("rejects fewer/more than four, duplicate Visits, duplicate positions, wrong store, and non-WAITING states", async () => {
    const base = [0, 1, 2, 3].map((index) => ({ visitId: visitIds[index], position: index + 1 }));
    await expect(startTableSession(db, tableIds[1], base.slice(0, 3), { storeId, staffId })).rejects.toBeInstanceOf(Error);
    await expect(startTableSession(db, tableIds[1], [...base, { visitId: visitIds[4], position: 5 }], { storeId, staffId })).rejects.toBeInstanceOf(Error);
    await expect(startTableSession(db, tableIds[1], base.map((seat, i) => i === 3 ? { ...seat, visitId: visitIds[0] } : seat), { storeId, staffId })).rejects.toBeInstanceOf(Error);
    await expect(startTableSession(db, tableIds[1], base.map((seat, i) => i === 3 ? { ...seat, position: 3 } : seat), { storeId, staffId })).rejects.toBeInstanceOf(Error);
    await expect(startTableSession(db, tableIds[1], base, { storeId: `other-${randomUUID()}`, staffId })).rejects.toBeInstanceOf(Error);
    await expect(startTableSession(db, tableIds[1], [0, 1, 2, 13].map((index, position) => ({ visitId: visitIds[index], position: position + 1 })), { storeId, staffId })).rejects.toBeInstanceOf(InvalidVisitTransitionError);
    await expect(startTableSession(db, tableIds[1], [0, 1, 2, 12].map((index, position) => ({ visitId: visitIds[index], position: position + 1 })), { storeId, staffId })).rejects.toBeInstanceOf(VisitCustomerUnavailableError);
    expect(await db.tableSession.count({ where: { storeId, mahjongTableId: tableIds[1] } })).toBe(0);
  }, 30_000);

  it("enforces database uniqueness for active table, Visit, position, and range", async () => {
    const active = await db.tableSession.findUniqueOrThrow({ where: { id: sessionIds[0] } });
    await expect(db.tableSession.create({ data: { storeId, mahjongTableId: tableIds[0] } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.tableSeat.create({ data: { storeId, tableSessionId: active.id, visitId: visitIds[4], position: 1 } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.tableSeat.create({ data: { storeId, tableSessionId: active.id, visitId: visitIds[4], position: 5 } })).rejects.toBeDefined();
  }, 30_000);

  it("prevents the same Visit from being assigned to another active Session", async () => {
    await expect(db.$transaction(async (tx) => {
      const session = await tx.tableSession.create({ data: { storeId, mahjongTableId: tableIds[2] } });
      await tx.tableSeat.create({ data: { storeId, tableSessionId: session.id, visitId: visitIds[0], position: 1 } });
    })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.tableSession.count({ where: { storeId, mahjongTableId: tableIds[2] } })).toBe(0);
  }, 30_000);

  it("rejects starting an already-active table and deactivating it", async () => {
    await expect(startTableSession(db, tableIds[0], [4, 5, 6, 7].map((index, position) => ({ visitId: visitIds[index], position: position + 1 })), { storeId, staffId })).rejects.toBeInstanceOf(TableSessionConflictError);
    await expect(deactivateTable(db, tableIds[0], { storeId, staffId })).rejects.toBeInstanceOf(TableHasActiveSessionError);
  }, 30_000);

  it("releases all four Visits and rejects a second release", async () => {
    const sessionId = sessionIds[0];
    await endTableSession(db, sessionId, { storeId, staffId });
    expect(await db.visit.count({ where: { id: { in: visitIds.slice(0, 4) }, storeId, status: VisitStatus.WAITING } })).toBe(4);
    expect(await db.tableSeat.count({ where: { storeId, tableSessionId: sessionId, removedAt: { not: null } } })).toBe(4);
    expect(await db.auditLog.count({ where: { storeId, action: "TABLE_SESSION_END", entityId: sessionId } })).toBe(1);
    await expect(endTableSession(db, sessionId, { storeId, staffId })).rejects.toBeInstanceOf(Error);
  }, 30_000);

  it("allows only one of two concurrent tables to start with the same four Visits", async () => {
    const seats = [8, 9, 10, 11].map((index, position) => ({ visitId: visitIds[index], position: position + 1 }));
    const results = await Promise.allSettled([
      startTableSession(db, tableIds[2], seats, { storeId, staffId }),
      startTableSession(db, tableIds[3], seats, { storeId, staffId }),
    ]);
    const successes = results.filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled");
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    sessionIds.push(successes[0].value);
    expect(await db.tableSeat.count({ where: { storeId, visitId: { in: visitIds.slice(8, 12) }, removedAt: null } })).toBe(4);
    await endTableSession(db, successes[0].value, { storeId, staffId });
  }, 60_000);

  it("audits table master updates and deactivation without deleting the table", async () => {
    const tableId = tableIds[1];
    expect(await db.auditLog.count({ where: { storeId, action: "TABLE_CREATE", entityId: { in: tableIds } } })).toBe(4);
    await updateTable(db, { tableId, name: `RENAMED ${randomUUID()}`, sortOrder: 20 }, { storeId, staffId });
    expect(await db.auditLog.count({ where: { storeId, action: "TABLE_UPDATE", entityId: tableId } })).toBe(1);
    expect(await deactivateTable(db, tableId, { storeId, staffId })).toBe(true);
    expect(await db.mahjongTable.count({ where: { id: tableId, storeId, isActive: false } })).toBe(1);
    expect(await db.auditLog.count({ where: { storeId, action: "TABLE_DEACTIVATE", entityId: tableId } })).toBe(1);
  }, 30_000);

  afterAll(async () => {
    if (storeId && staffId) {
      const active = await db.tableSession.findMany({ where: { storeId, mahjongTableId: { in: tableIds }, status: TableSessionStatus.ACTIVE }, select: { id: true } });
      for (const session of active) await endTableSession(db, session.id, { storeId, staffId });
      const waiting = await db.visit.findMany({ where: { storeId, id: { in: visitIds }, status: VisitStatus.WAITING }, select: { id: true } });
      for (const visit of waiting) await checkOutVisit(db, visit.id, { storeId, staffId });
      if (customerIds.length) await db.customer.updateMany({ where: { id: { in: customerIds }, storeId }, data: { isActive: false } });
      if (tableIds.length) await db.mahjongTable.updateMany({ where: { id: { in: tableIds }, storeId, isActive: true }, data: { isActive: false } });
    }
    await db.$disconnect();
  }, 60_000);
});
