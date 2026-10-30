import "dotenv/config";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";
import { openBusinessDay, closeBusinessDay, updateFreeGamePrice, BusinessDayBlockedError, BusinessDayClosedError } from "./business-day-service";
import { registerAndCheckIn } from "@/features/visits/reception-service";
import { checkOutVisit } from "@/features/visits/visit-service";
import { startTableSession, endTableSession } from "@/features/tables/table-service";
import { getGameEntryData } from "@/features/games/game-queries";
import { createGame, correctGame, GameEntryChangedError } from "@/features/games/game-service";
import { changeTableMembers, TableMemberUnavailableError } from "@/features/tables/table-members-service";
import { getBusinessDayPageData } from "./business-day-queries";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";

const enabled = process.env.RUN_BUSINESS_DAY_DB_TESTS === "true";
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_BUSINESS_DAY_FIXTURE");

function adapter(tx: Prisma.TransactionClient) {
  let serial = 0;
  return { $transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => {
    const name = `business_fixture_${++serial}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
    try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
    catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
}

describe.skipIf(!enabled)("Business day rollback-only integration", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  afterAll(async () => { await db.$disconnect(); });
  it("records a cross-midnight day, hanchan revenue and correction, then closes without changing any existing store", async () => {
    const storeId = `business-test-${randomUUID()}`;
    const counts = { stores: await db.store.count(), games: await db.game.count(), visits: await db.visit.count() };
    await expect(db.$transaction(async (tx) => {
      await tx.store.create({ data: { id: storeId, name: "営業日検証専用", timezone: "Asia/Tokyo" } });
      const staff = await tx.staff.create({ data: { storeId, name: "検証担当", loginId: `business-${randomUUID()}`, passwordHash: "not-a-login-account", role: "OWNER" } });
      const context = { storeId, staffId: staff.id };
      const service = adapter(tx);
      await expect(registerAndCheckIn(service, { requestId: randomUUID(), internalName: "閉店時", confirmDifferentPerson: false }, context)).rejects.toBeInstanceOf(BusinessDayClosedError);
      const key = randomUUID();
      const { day } = await openBusinessDay(service, key, context);
      expect((await openBusinessDay(service, randomUUID(), context)).day.id).toBe(day.id);
      await tx.businessDay.update({ where: { id: day.id }, data: { openedAt: new Date("2026-01-01T14:00:00Z"), label: "2026-01-01" } });
      const customers = [];
      for (let index = 0; index < 5; index++) customers.push(await registerAndCheckIn(service, { requestId: randomUUID(), internalName: `検証参加者${index}`, confirmDifferentPerson: false }, context));
      await expect(closeBusinessDay(service, day.id, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
      const visits = await tx.visit.findMany({ where: { storeId }, orderBy: { customerId: "asc" } });
      expect(visits.every((visit) => visit.businessDayId === day.id)).toBe(true);
      await tx.storeRule.create({ data: { storeId, version: 1, startingPoints: 25000, returnPoints: 30000, umaFirst: 20, umaSecond: 10, umaThird: -10, umaFourth: -20, okaTop: 20, pointUnit: 100, requiredTotal: 100000, allowNegative: true, tieBreakRule: "POSITION_ASC", scorePrecision: 1, roundingMode: "NONE" } });
      const table = await tx.mahjongTable.create({ data: { storeId, name: "1卓" } });
      const sessionId = await startTableSession(service, table.id, visits.slice(0, 4).map((visit, index) => ({ visitId: visit.id, position: index + 1 })), context);
      const points = [40000, 30000, 20000, 10000].map((finalPoints, index) => ({ position: index + 1, finalPoints }));
      const entry = (await getGameEntryData(tx, storeId, sessionId))!;
      const game = await createGame(service, { expectedSequence: entry.nextSequence, seatingToken: entry.seatingToken, tableSessionId: sessionId, idempotencyKey: randomUUID(), points }, context);
      expect(await tx.game.findUniqueOrThrow({ where: { id: game.id } })).toMatchObject({ businessDayId: day.id, freeGamePriceYen: 2500 });
      await updateFreeGamePrice(service, 3000, context);
      const replacement = await correctGame(service, { gameId: game.id, idempotencyKey: randomUUID(), points, reason: "検証" }, context);
      const firstParticipants = await tx.gamePlayerResult.findMany({ where: { gameId: replacement.id }, orderBy: { position: "asc" }, select: { customerId: true, visitId: true, position: true } });
      const changeEntry = (await getGameEntryData(tx, storeId, sessionId))!;
      const memberRequest = { sessionId, requestKey: randomUUID(), seatingToken: changeEntry.seatingToken, expectedSequence: changeEntry.nextSequence, mode: "replace" as const, position: 1, incomingVisitId: visits[4].id };
      await expect(changeTableMembers(service, { ...memberRequest, incomingVisitId: visits[1].id }, context)).rejects.toBeInstanceOf(TableMemberUnavailableError);
      await changeTableMembers(service, memberRequest, context);
      await expect(changeTableMembers(service, memberRequest, context)).resolves.toEqual({ replayed: true });
      expect((await tx.visit.findUniqueOrThrow({ where: { id: visits[0].id } })).status).toBe("WAITING");
      expect((await tx.visit.findUniqueOrThrow({ where: { id: visits[4].id } })).status).toBe("PLAYING");
      await expect(createGame(service, { tableSessionId: sessionId, idempotencyKey: randomUUID(), expectedSequence: changeEntry.nextSequence, seatingToken: changeEntry.seatingToken, points }, context)).rejects.toBeInstanceOf(GameEntryChangedError);
      const secondEntry = (await getGameEntryData(tx, storeId, sessionId))!;
      const secondKey = randomUUID();
      const secondInput = { tableSessionId: sessionId, idempotencyKey: secondKey, expectedSequence: secondEntry.nextSequence, seatingToken: secondEntry.seatingToken, points };
      await createGame(service, secondInput, context);
      expect((await createGame(service, secondInput, context)).replayed).toBe(true);
      await expect(createGame(service, { ...secondInput, idempotencyKey: randomUUID() }, context)).rejects.toBeInstanceOf(GameEntryChangedError);
      const swapEntry = (await getGameEntryData(tx, storeId, sessionId))!;
      await changeTableMembers(service, { sessionId, requestKey: randomUUID(), seatingToken: swapEntry.seatingToken, expectedSequence: swapEntry.nextSequence, mode: "swap", position: 1, otherPosition: 2 }, context);
      expect(await tx.tableSeat.count({ where: { tableSessionId: sessionId, removedAt: null } })).toBe(4);
      expect(await tx.gamePlayerResult.findMany({ where: { gameId: replacement.id }, orderBy: { position: "asc" }, select: { customerId: true, visitId: true, position: true } })).toEqual(firstParticipants);
      const rollbackEntry = (await getGameEntryData(tx, storeId, sessionId))!;
      const failAfterChanges = new Error("rollback member changes");
      const failingService = { $transaction: async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => service.$transaction(async (client) => { await fn(client); throw failAfterChanges; }) } as unknown as Pick<PrismaClient, "$transaction">;
      await expect(changeTableMembers(failingService, { sessionId, requestKey: randomUUID(), seatingToken: rollbackEntry.seatingToken, expectedSequence: rollbackEntry.nextSequence, mode: "replace", position: 1, incomingVisitId: visits[0].id }, context)).rejects.toBe(failAfterChanges);
      expect((await getGameEntryData(tx, storeId, sessionId))?.seatingToken).toBe(rollbackEntry.seatingToken);
      const total = await tx.game.aggregate({ where: { storeId, businessDayId: day.id, status: "CONFIRMED" }, _count: { _all: true }, _sum: { freeGamePriceYen: true } });
      expect(total._count._all).toBe(2); expect(total._sum.freeGamePriceYen).toBe(5000);
      const summary = await getBusinessDayPageData(service as PrismaClient, storeId);
      expect(summary?.days[0].metrics).toEqual({ games: 2, revenueYen: 5000, visits: 5, customers: 5 });
      expect(summary?.days[0].tables).toEqual([{ id: table.id, name: "1卓", games: 2, revenueYen: 5000 }]);
      const home = await getDashboardData(service as PrismaClient, storeId);
      expect(home).toMatchObject({ source: "database", currentDay: { id: day.id, freeGamePriceYen: 2500 }, metrics: { games: 2, revenueYen: 5000, customers: 5 }, waiting: 1, playing: 4, activeTables: 1, availableTables: 0 });
      expect(home?.recentGames.map((item) => item.id)).toContain(replacement.id);
      expect(home?.recentGames.map((item) => item.id)).not.toContain(game.id);
      expect(home?.recentGames).toHaveLength(2);
      await endTableSession(service, sessionId, context);
      for (const visit of visits) await checkOutVisit(service, visit.id, context);
      await closeBusinessDay(service, day.id, context);
      await correctGame(service, { gameId: replacement.id, idempotencyKey: randomUUID(), points, reason: "終了後の訂正" }, context);
      expect((await openBusinessDay(service, key, context)).day.closedAt).not.toBeNull();
      expect((await openBusinessDay(service, randomUUID(), context)).day.freeGamePriceYen).toBe(3000);
      const history = await getBusinessDayPageData(service as PrismaClient, storeId);
      expect(history?.days.find((entry) => entry.id === day.id)?.metrics.revenueYen).toBe(5000);
      expect(await getDashboardData(service as PrismaClient, storeId)).toMatchObject({ currentDay: { freeGamePriceYen: 3000 }, metrics: { games: 0, revenueYen: 0, customers: 0 }, recentGames: [] });
      throw rollback;
    }, { timeout: 150_000, maxWait: 10_000 })).rejects.toBe(rollback);
    expect(await db.store.findUnique({ where: { id: storeId } })).toBeNull();
    expect({ stores: await db.store.count(), games: await db.game.count(), visits: await db.visit.count() }).toEqual(counts);
  }, 180_000);
});
