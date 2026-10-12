import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient, Role, GameStatus, TableSessionStatus, VisitStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createGame, createStoreRuleVersion, correctGame, GameIdempotencyConflictError } from "./game-service";
import { startTableSession } from "@/features/tables/table-service";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";

const enabled = process.env.RUN_GAME_DB_TESTS === "true" && Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
const dbTests = describe.skipIf(!enabled);
const db = new PrismaClient();
const rollbackMarker = { rollbackTest: true };

function savepointDatabase(tx: Prisma.TransactionClient, rejectBeforeCommit = false) {
  let count = 0;
  return {
    $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
      const savepoint = `sprint4_test_${++count}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
      try {
        const result = await callback(tx);
        if (rejectBeforeCommit) throw rollbackMarker;
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    },
  } as unknown as Parameters<typeof createGame>[0];
}

dbTests("Game integration uses a rollback-only development DB transaction", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  afterAll(async () => { await db.$disconnect(); });

  it("pins a StoreRule to a new session, records, replays, corrects, and audits atomically", async () => {
    let testStoreId = "";
    let testSessionId = "";
    const testCustomerIds: string[] = [];
    let ruleCountBefore = 0;
    await expect(db.$transaction(async (tx) => {
      const owner = await tx.staff.findFirst({ where: { role: Role.OWNER, isActive: true, store: { is: { isActive: true } } }, select: { id: true, storeId: true } });
      if (!owner) throw new Error("Active development OWNER required.");
      testStoreId = owner.storeId;
      ruleCountBefore = await tx.storeRule.count({ where: { storeId: owner.storeId } });
      const rule = await tx.storeRule.findFirst({ where: { storeId: owner.storeId, isActive: true } });
      if (!rule) throw new Error("Development StoreRule migration seed required.");
      const adapter = savepointDatabase(tx);
      const context = { storeId: owner.storeId, staffId: owner.id };
      const table = await tx.mahjongTable.create({ data: { storeId: owner.storeId, name: `TEST GAME TABLE ${randomUUID()}`, sortOrder: 9999 } });
      const visits: Array<{ id: string }> = [];
      for (let index = 0; index < 4; index += 1) {
        const customer = await tx.customer.create({ data: { storeId: owner.storeId, customerCode: `GTEST-${randomUUID()}`, internalName: `TEST GAME CUSTOMER ${index + 1}` }, select: { id: true } });
        testCustomerIds.push(customer.id);
        visits.push(await tx.visit.create({ data: { storeId: owner.storeId, customerId: customer.id, status: VisitStatus.WAITING }, select: { id: true } }));
      }
      const sessionId = await startTableSession(adapter, table.id, visits.map((visit, index) => ({ visitId: visit.id, position: index + 1 })), context);
      testSessionId = sessionId;
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.storeRuleId).toBe(rule.id);
      await tx.tableSession.update({ where: { id: sessionId }, data: { storeRuleId: null } });

      const key = randomUUID();
      const points = [40_000, 30_000, 20_000, 10_000].map((finalPoints, index) => ({ position: index + 1, finalPoints }));
      const first = await createGame(adapter, { tableSessionId: sessionId, idempotencyKey: key, points }, context);
      expect(first.sequenceNumber).toBe(1);
      const firstGameTimes = await tx.game.findUniqueOrThrow({ where: { id: first.id }, select: { confirmedAt: true, effectiveAt: true } });
      expect(firstGameTimes.effectiveAt).toEqual(firstGameTimes.confirmedAt);
      expect(await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ storeRuleId: rule.id, status: TableSessionStatus.ACTIVE });
      expect(await tx.auditLog.count({ where: { storeId: owner.storeId, action: "TABLE_SESSION_RULE_BIND", entityId: sessionId } })).toBe(1);
      expect(await createGame(adapter, { tableSessionId: sessionId, idempotencyKey: key, points: [...points].reverse() }, context)).toMatchObject({ id: first.id, replayed: true });
      await expect(createGame(adapter, { tableSessionId: sessionId, idempotencyKey: key, points: points.map((point, index) => index ? point : { ...point, finalPoints: 39_900 }) }, context)).rejects.toBeInstanceOf(GameIdempotencyConflictError);

      const version = await createStoreRuleVersion(adapter, { startingPoints: 25_000, returnPoints: 30_000, umaFirst: 20, umaSecond: 10, umaThird: -10, umaFourth: -20, okaTop: 20, pointUnit: 100, requiredTotal: 100_000, allowNegative: true, tieBreakRule: "POSITION_ASC", scorePointDivisor: 1000, scorePrecision: 1, roundingMode: "NONE", isProvisional: true }, context);
      expect(version).toBe(rule.version + 1);
      const second = await createGame(adapter, { tableSessionId: sessionId, idempotencyKey: randomUUID(), points }, context);
      expect(second.sequenceNumber).toBe(2);
      const third = await createGame(adapter, { tableSessionId: sessionId, idempotencyKey: randomUUID(), points }, context);
      expect(third.sequenceNumber).toBe(3);
      expect(await tx.gamePlayerResult.count({ where: { gameId: first.id } })).toBe(4);
      expect(await tx.gamePlayerResult.count({ where: { gameId: second.id } })).toBe(4);
      const original = await tx.game.findUniqueOrThrow({ where: { id: first.id }, include: { results: true } });
      expect(original.ruleSnapshot).toMatchObject({ version: rule.version, startingPoints: 25_000, returnPoints: 30_000 });
      expect(original.ruleSnapshot).not.toMatchObject({ version });

      const changedPoints = [41_000, 29_000, 20_000, 10_000].map((finalPoints, index) => ({ position: index + 1, finalPoints }));
      const correctionKey = randomUUID();
      const replacement = await correctGame(adapter, { gameId: first.id, idempotencyKey: correctionKey, reason: "テスト訂正", points: changedPoints }, context);
      expect(replacement).toMatchObject({ sequenceNumber: 1 });
      expect(await tx.game.findUniqueOrThrow({ where: { id: replacement.id }, select: { effectiveAt: true } })).toMatchObject({ effectiveAt: firstGameTimes.effectiveAt });
      expect(await correctGame(adapter, { gameId: first.id, idempotencyKey: correctionKey, reason: "テスト訂正", points: changedPoints }, context)).toEqual(replacement);
      await expect(correctGame(adapter, { gameId: first.id, idempotencyKey: correctionKey, reason: "別の入力", points: changedPoints }, context)).rejects.toBeInstanceOf(GameIdempotencyConflictError);
      expect(await tx.game.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: GameStatus.CORRECTED, correctedByGameId: replacement.id, correctionReason: "テスト訂正" });
      expect(await tx.game.findUniqueOrThrow({ where: { id: replacement.id } })).toMatchObject({ status: GameStatus.CONFIRMED, revisionNumber: 2 });
      expect(await tx.game.count({ where: { storeId: owner.storeId, tableSessionId: sessionId, sequenceNumber: 1, status: GameStatus.CONFIRMED } })).toBe(1);
      expect(await tx.auditLog.count({ where: { storeId: owner.storeId, entityId: first.id, action: "GAME_RESULT_VOID" } })).toBe(1);
      expect(await tx.auditLog.count({ where: { storeId: owner.storeId, entityId: replacement.id, action: "GAME_RESULT_CORRECT" } })).toBe(1);
      expect(await tx.auditLog.count({ where: { storeId: owner.storeId, entityId: first.id, action: "GAME_RESULT_CREATE" } })).toBe(1);
      expect(await tx.tableSession.count({ where: { id: sessionId, storeId: owner.storeId, status: TableSessionStatus.ACTIVE } })).toBe(1);
      expect(await tx.visit.count({ where: { id: { in: visits.map((visit) => visit.id) }, storeId: owner.storeId, status: VisitStatus.PLAYING } })).toBe(4);
      await expect(createGame(adapter, { tableSessionId: sessionId, idempotencyKey: randomUUID(), points }, { storeId: `other-${randomUUID()}`, staffId: owner.id })).rejects.toThrow();

      const gameCountBeforeFailure = await tx.game.count({ where: { tableSessionId: sessionId } });
      const auditCountBeforeFailure = await tx.auditLog.count({ where: { storeId: owner.storeId, action: "GAME_RESULT_CREATE" } });
      await expect(createGame(savepointDatabase(tx, true), { tableSessionId: sessionId, idempotencyKey: randomUUID(), points }, context)).rejects.toMatchObject(rollbackMarker);
      expect(await tx.game.count({ where: { tableSessionId: sessionId } })).toBe(gameCountBeforeFailure);
      expect(await tx.auditLog.count({ where: { storeId: owner.storeId, action: "GAME_RESULT_CREATE" } })).toBe(auditCountBeforeFailure);
      throw rollbackMarker;
    }, { timeout: 60_000, maxWait: 10_000 })).rejects.toMatchObject(rollbackMarker);
    expect(await db.tableSession.count({ where: { id: testSessionId, storeId: testStoreId } })).toBe(0);
    expect(await db.customer.count({ where: { id: { in: testCustomerIds }, storeId: testStoreId } })).toBe(0);
    expect(await db.storeRule.count({ where: { storeId: testStoreId } })).toBe(ruleCountBefore);
  }, 60_000);
});
