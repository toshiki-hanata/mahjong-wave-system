import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient, type BusinessDay } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";
import { BusinessDayBlockedError, openBusinessDay } from "./business-day-service";
import { BusinessDayTimeChangedError, BusinessDayTimePermissionError, updateBusinessDayTimes } from "./business-day-time-service";
import { businessLocalDateTime, type BusinessDayTimeInput } from "./business-day-time";
import { getBusinessDayPageData } from "./business-day-queries";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";

const enabled = process.env.RUN_BUSINESS_DAY_TIME_DB_TESTS === "true";
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_TIME_CORRECTION_FIXTURE");
function adapter(tx: Prisma.TransactionClient) {
  let serial = 0;
  return { $transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => {
    const name = `time_fixture_${++serial}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
    try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
    catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
}
function request(day: BusinessDay, mode: "edit" | "close", closedAtLocal: string): BusinessDayTimeInput {
  return { businessDayId: day.id, requestKey: randomUUID(), mode, expectedOpenedAt: day.openedAt.toISOString(), expectedClosedAt: day.closedAt?.toISOString() ?? "", openedAtLocal: businessLocalDateTime(day.openedAt, day.timezone), closedAtLocal, reason: "終了を押し忘れたため実際の時刻に訂正" };
}

describe.skipIf(!enabled)("Business time correction rollback-only integration", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  afterAll(async () => { await db.$disconnect(); });
  it("checks permissions, forgotten close, history, stale forms, overlaps and atomic rollback", async () => {
    const storeId = `time-test-${randomUUID()}`;
    await expect(db.$transaction(async (tx) => {
      await tx.store.create({ data: { id: storeId, name: "営業日時検証専用", timezone: "Asia/Tokyo" } });
      const manager = await tx.staff.create({ data: { storeId, role: "MANAGER", name: "検証責任者", loginId: randomUUID(), passwordHash: "not-a-login-account" } });
      const staff = await tx.staff.create({ data: { storeId, role: "STAFF", name: "検証担当者", loginId: randomUUID(), passwordHash: "not-a-login-account" } });
      const context = { storeId, staffId: manager.id }, service = adapter(tx);
      const opened = await openBusinessDay(service, randomUUID(), context);
      const day = await tx.businessDay.update({ where: { id: opened.day.id }, data: { openedAt: new Date("2026-01-10T00:00:00.123Z"), label: "2026-01-10" } });
      const customer = await tx.customer.create({ data: { storeId, customerCode: "TIME-TEST", internalName: "検証来店者" } });
      const visit = await tx.visit.create({ data: { storeId, customerId: customer.id, businessDayId: day.id, checkedInAt: new Date("2026-01-10T01:00Z") } });
      const close = request(day, "close", "2026-01-10T13:00");
      await expect(updateBusinessDayTimes(service, close, { storeId, staffId: staff.id })).rejects.toBeInstanceOf(BusinessDayTimePermissionError);
      await expect(updateBusinessDayTimes(service, close, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
      await tx.visit.update({ where: { id: visit.id }, data: { status: "CHECKED_OUT", checkedOutAt: new Date("2026-01-10T02:00Z") } });
      const table = await tx.mahjongTable.create({ data: { storeId, name: "検証卓" } });
      const session = await tx.tableSession.create({ data: { storeId, businessDayId: day.id, mahjongTableId: table.id, status: "ACTIVE", startedAt: new Date("2026-01-10T01:00Z") } });
      await expect(updateBusinessDayTimes(service, close, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
      await tx.tableSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date("2026-01-10T03:00Z") } });
      const home = await getDashboardData(service as PrismaClient, storeId);
      expect(home).toMatchObject({ source: "database", currentDay: { id: day.id }, metrics: { games: 0, revenueYen: 0, customers: 1 }, waiting: 0, playing: 0, activeTables: 0, availableTables: 1 });
      expect(home?.tables).toHaveLength(1);
      await expect(updateBusinessDayTimes(service, { ...close, closedAtLocal: "2026-01-10T11:30" }, context)).rejects.toThrow("記録より前");
      await updateBusinessDayTimes(service, close, context);
      const closed = await tx.businessDay.findUniqueOrThrow({ where: { id: day.id } });
      expect(await getDashboardData(service as PrismaClient, storeId)).toMatchObject({ currentDay: null, metrics: null, recentGames: [] });
      expect(closed).toMatchObject({ closedAt: new Date("2026-01-10T04:00Z"), closedByStaffId: manager.id, openedAt: day.openedAt });
      expect((await updateBusinessDayTimes(service, close, context)).replayed).toBe(true);
      await expect(updateBusinessDayTimes(service, { ...close, requestKey: randomUUID() }, context)).rejects.toBeInstanceOf(BusinessDayTimeChangedError);
      const edit = { ...request(closed, "edit", "2026-01-10T13:00"), openedAtLocal: "2026-01-09T23:00", reason: "開始日時の訂正" };
      await updateBusinessDayTimes(service, edit, context);
      const fixed = await tx.businessDay.findUniqueOrThrow({ where: { id: day.id } });
      expect(fixed).toMatchObject({ label: "2026-01-09", freeGamePriceYen: 2500, openedAt: new Date("2026-01-09T14:00Z") });
      const history = await getBusinessDayPageData(service as PrismaClient, storeId, true);
      expect(history?.days[0].timeHistory).toHaveLength(2);
      expect(history?.days[0].timeHistory.some((log) => log.change.reason === edit.reason && log.staffName === manager.name)).toBe(true);
      expect((await getBusinessDayPageData(service as PrismaClient, storeId))?.days[0].timeHistory).toEqual([]);
      await tx.businessDay.create({ data: { storeId, requestKey: randomUUID(), label: "2026-01-10", timezone: "Asia/Tokyo", freeGamePriceYen: 3000, openedAt: new Date("2026-01-10T06:00Z"), closedAt: new Date("2026-01-10T08:00Z"), openedByStaffId: manager.id, closedByStaffId: manager.id } });
      await expect(updateBusinessDayTimes(service, request(fixed, "edit", "2026-01-10T16:00"), context)).rejects.toThrow("時間が重なります");
      const failure = new Error("rollback time and audit");
      const failing = { $transaction: async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => service.$transaction(async (client) => { await fn(client); throw failure; }) } as unknown as Pick<PrismaClient, "$transaction">;
      await expect(updateBusinessDayTimes(failing, request(fixed, "edit", "2026-01-10T14:00"), context)).rejects.toBe(failure);
      expect(await tx.businessDay.findUniqueOrThrow({ where: { id: day.id } })).toEqual(fixed);
      expect(await tx.auditLog.count({ where: { storeId, action: "BUSINESS_DAY_TIME_UPDATE" } })).toBe(2);
      expect(await tx.visit.findUniqueOrThrow({ where: { id: visit.id } })).toMatchObject({ businessDayId: day.id, checkedOutAt: new Date("2026-01-10T02:00Z") });
      expect(await tx.tableSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ businessDayId: day.id, endedAt: new Date("2026-01-10T03:00Z") });
      throw rollback;
    }, { timeout: 120_000, maxWait: 10_000 })).rejects.toBe(rollback);
    expect(await db.store.findUnique({ where: { id: storeId } })).toBeNull();
  }, 150_000);
});
