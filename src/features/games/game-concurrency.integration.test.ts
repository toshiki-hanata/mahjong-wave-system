import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient, Role, TableSessionStatus, VisitStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { checkInVisit, checkOutVisit } from "@/features/visits/visit-service";
import { createCustomer, deactivateCustomer } from "@/features/customers/customer-service";
import { createTable, deactivateTable, endTableSession, startTableSession } from "@/features/tables/table-service";
import { recordAuditLog } from "@/lib/audit-log";
import { createGame, GameIdempotencyConflictError } from "./game-service";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";

const databaseUrl = process.env.DIRECT_URL;
const enabled = process.env.RUN_GAME_CONCURRENCY_DB_TESTS === "true" && Boolean(databaseUrl);
const concurrencySuite = describe.skipIf(!enabled);

// Each PrismaClient owns a separate pool; the test also verifies that concurrent
// interactive transactions receive different PostgreSQL backend process IDs.
const connectionA = new PrismaClient({ datasources: { db: { url: databaseUrl ?? "" } } });
const connectionB = new PrismaClient({ datasources: { db: { url: databaseUrl ?? "" } } });

const testMarker = `SPRINT4-CONCURRENCY-${randomUUID()}`;
const context: { storeId: string; staffId: string } = { storeId: "", staffId: "" };
let tableId: string | undefined;
let sessionId: string | undefined;
const customerIds: string[] = [];
const visitIds: string[] = [];
const committedGameIds = new Set<string>();

const pointsA = [40_000, 30_000, 20_000, 10_000].map((finalPoints, index) => ({ position: index + 1, finalPoints }));
const pointsB = [39_900, 30_100, 20_000, 10_000].map((finalPoints, index) => ({ position: index + 1, finalPoints }));

async function checkIndependentTransactions() {
  let readyCount = 0;
  let markReady!: () => void;
  let release!: () => void;
  const bothReady = new Promise<void>((resolve) => { markReady = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const probe = (client: PrismaClient) => client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    readyCount += 1;
    if (readyCount === 2) markReady();
    await hold;
    return rows[0]!.pid;
  });
  const pending = Promise.all([probe(connectionA), probe(connectionB)]);
  await bothReady;
  release();
  const [pidA, pidB] = await pending;
  expect(pidA).not.toBe(pidB);
}

async function createTestFixtures() {
  const owner = await connectionA.staff.findFirst({
    where: { role: Role.OWNER, isActive: true, store: { is: { isActive: true } } },
    select: { id: true, storeId: true },
  });
  if (!owner) throw new Error("An active development OWNER is required for the isolated concurrency fixture.");
  context.storeId = owner.storeId;
  context.staffId = owner.id;

  tableId = await createTable(connectionA, { name: `${testMarker} TABLE`, sortOrder: 9999 }, context);
  for (let position = 1; position <= 4; position += 1) {
    const customerId = await createCustomer(connectionA, {
      customerCode: `${testMarker}-${position}`,
      internalName: `${testMarker} CUSTOMER ${position}`,
      note: null,
      rankingOptIn: false,
      nickname: "",
      profileVisible: false,
    }, context);
    customerIds.push(customerId);
    visitIds.push(await checkInVisit(connectionA, customerId, context));
  }
  sessionId = await startTableSession(connectionA, tableId, visitIds.map((visitId, index) => ({ visitId, position: index + 1 })), context);
}

async function testDatabase(client: PrismaClient) {
  if (!sessionId) throw new Error("Concurrency test session was not created.");
  return {
    client,
    tableSessionId: sessionId,
    context,
  };
}

async function queryGameState() {
  if (!sessionId) throw new Error("Concurrency test session was not created.");
  const [games, groupedResults, createAudits, session, visits, seats] = await Promise.all([
    connectionA.game.findMany({ where: { storeId: context.storeId, tableSessionId: sessionId }, orderBy: { sequenceNumber: "asc" }, select: { id: true, sequenceNumber: true, idempotencyKey: true, status: true } }),
    connectionA.gamePlayerResult.groupBy({ by: ["gameId"], where: { storeId: context.storeId, game: { tableSessionId: sessionId } }, _count: { _all: true } }),
    connectionA.auditLog.count({ where: { storeId: context.storeId, action: "GAME_RESULT_CREATE", entityId: { in: [...committedGameIds] } } }),
    connectionA.tableSession.findFirst({ where: { id: sessionId, storeId: context.storeId }, select: { status: true } }),
    connectionA.visit.findMany({ where: { id: { in: visitIds }, storeId: context.storeId }, select: { status: true } }),
    connectionA.tableSeat.findMany({ where: { tableSessionId: sessionId, storeId: context.storeId, removedAt: null }, select: { id: true } }),
  ]);
  return { games, groupedResults, createAudits, session, visits, seats };
}

concurrencySuite("Game result locking with independent PostgreSQL connections", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(connectionA); });
  afterAll(async () => {
    try {
      if (!context.storeId || !context.staffId) return;
      // Recover all prefixed fixtures as well as this run's data if cleanup was
      // interrupted by a runner timeout. These names are test-only and unique.
      const testCustomers = await connectionA.customer.findMany({
        where: { storeId: context.storeId, customerCode: { startsWith: "SPRINT4-CONCURRENCY-" } },
        select: { id: true, isActive: true },
      });
      const allTestVisits = await connectionA.visit.findMany({
        where: { storeId: context.storeId, customerId: { in: testCustomers.map((customer) => customer.id) } },
        select: { id: true, status: true },
      });
      const allTestSeats = await connectionA.tableSeat.findMany({
        where: { storeId: context.storeId, visitId: { in: allTestVisits.map((visit) => visit.id) } },
        select: { tableSessionId: true },
      });
      const testSessionIds = [...new Set(allTestSeats.map((seat) => seat.tableSessionId))];
      for (const testSessionId of testSessionIds) {
        const session = await connectionA.tableSession.findFirst({ where: { id: testSessionId, storeId: context.storeId }, select: { status: true } });
        if (session?.status === TableSessionStatus.ACTIVE) await endTableSession(connectionA, testSessionId, context);
      }
      const waitingTestVisits = await connectionA.visit.findMany({
        where: { storeId: context.storeId, customerId: { in: testCustomers.map((customer) => customer.id) }, status: VisitStatus.WAITING },
        select: { id: true },
      });
      for (const visit of waitingTestVisits) await checkOutVisit(connectionA, visit.id, context);
      for (const customer of testCustomers) if (customer.isActive) await deactivateCustomer(connectionA, customer.id, context);
      const testTables = await connectionA.mahjongTable.findMany({
        where: { storeId: context.storeId, name: { startsWith: "SPRINT4-CONCURRENCY-" }, isActive: true },
        select: { id: true },
      });
      for (const table of testTables) await deactivateTable(connectionA, table.id, context);

      for (const testSessionId of testSessionIds) {
        const cleanupAlreadyRecorded = await connectionA.auditLog.count({ where: { storeId: context.storeId, action: "GAME_CONCURRENCY_TEST_CLEANUP", entityType: "TableSession", entityId: testSessionId } });
        if (cleanupAlreadyRecorded > 0) continue;
        const retainedGames = await connectionA.game.findMany({ where: { storeId: context.storeId, tableSessionId: testSessionId }, select: { id: true, sequenceNumber: true } });
        await recordAuditLog({
          storeId: context.storeId,
          actorStaffId: context.staffId,
          action: "GAME_CONCURRENCY_TEST_CLEANUP",
          entityType: "TableSession",
          entityId: testSessionId,
          metadata: { testOnly: true, retainedGameIds: retainedGames.map((game) => game.id), retainedGameCount: retainedGames.length, sequences: retainedGames.map((game) => game.sequenceNumber) },
        }, connectionA);
      }
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  }, 120_000);

  it("serializes same-key replays, conflicts, distinct sequences, and rolls back a failing peer", async () => {
    await checkIndependentTransactions();
    await createTestFixtures();
    const dbA = await testDatabase(connectionA);
    const dbB = await testDatabase(connectionB);

    const sameKey = randomUUID();
    const sameKeyResults = await Promise.all([
      createGame(dbA.client, { tableSessionId: dbA.tableSessionId, idempotencyKey: sameKey, points: pointsA }, context),
      createGame(dbB.client, { tableSessionId: dbB.tableSessionId, idempotencyKey: sameKey, points: pointsA }, context),
    ]);
    expect(sameKeyResults[0]!.id).toBe(sameKeyResults[1]!.id);
    expect(sameKeyResults.filter((result) => !result.replayed)).toHaveLength(1);
    expect(sameKeyResults.filter((result) => result.replayed)).toHaveLength(1);
    committedGameIds.add(sameKeyResults[0]!.id);
    let state = await queryGameState();
    expect(state.games).toHaveLength(1);
    expect(state.games.filter((game) => game.idempotencyKey === sameKey)).toHaveLength(1);
    expect(state.groupedResults).toEqual([{ gameId: sameKeyResults[0]!.id, _count: { _all: 4 } }]);
    expect(state.createAudits).toBe(1);

    const conflictingKey = randomUUID();
    const conflicting = await Promise.allSettled([
      createGame(dbA.client, { tableSessionId: dbA.tableSessionId, idempotencyKey: conflictingKey, points: pointsA }, context),
      createGame(dbB.client, { tableSessionId: dbB.tableSessionId, idempotencyKey: conflictingKey, points: pointsB }, context),
    ]);
    const conflictSuccesses = conflicting.filter((result) => result.status === "fulfilled");
    const conflictRejections = conflicting.filter((result) => result.status === "rejected");
    expect(conflictSuccesses).toHaveLength(1);
    expect(conflictRejections).toHaveLength(1);
    expect(conflictRejections[0]!.status === "rejected" && conflictRejections[0]!.reason).toBeInstanceOf(GameIdempotencyConflictError);
    if (conflictSuccesses[0]?.status === "fulfilled") committedGameIds.add(conflictSuccesses[0].value.id);
    state = await queryGameState();
    expect(state.games).toHaveLength(2);
    expect(state.games.filter((game) => game.idempotencyKey === conflictingKey)).toHaveLength(1);
    expect(state.groupedResults).toHaveLength(2);
    expect(state.groupedResults.every((result) => result._count._all === 4)).toBe(true);
    expect(state.createAudits).toBe(2);

    const distinctKeyA = randomUUID();
    const distinctKeyB = randomUUID();
    const distinctResults = await Promise.all([
      createGame(dbA.client, { tableSessionId: dbA.tableSessionId, idempotencyKey: distinctKeyA, points: pointsA }, context),
      createGame(dbB.client, { tableSessionId: dbB.tableSessionId, idempotencyKey: distinctKeyB, points: pointsB }, context),
    ]);
    distinctResults.forEach((result) => committedGameIds.add(result.id));
    expect(distinctResults.map((result) => result.sequenceNumber).sort()).toEqual([3, 4]);
    state = await queryGameState();
    expect(state.games.map((game) => game.sequenceNumber)).toEqual([1, 2, 3, 4]);
    expect(new Set(state.games.map((game) => game.sequenceNumber)).size).toBe(4);
    expect(state.groupedResults).toHaveLength(4);
    expect(state.groupedResults.every((result) => result._count._all === 4)).toBe(true);
    expect(state.createAudits).toBe(4);

    const failingKey = randomUUID();
    const injectedFailure = new Error("intentional concurrency integration rollback");
    const failingClient = {
      $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        connectionB.$transaction(async (tx) => {
          await callback(tx);
          throw injectedFailure;
        }),
    } as unknown as Parameters<typeof createGame>[0];
    const failureRace = await Promise.allSettled([
      createGame(dbA.client, { tableSessionId: dbA.tableSessionId, idempotencyKey: randomUUID(), points: pointsA }, context),
      createGame(failingClient, { tableSessionId: dbB.tableSessionId, idempotencyKey: failingKey, points: pointsB }, context),
    ]);
    const failureSuccess = failureRace.find((result) => result.status === "fulfilled");
    const failureRejected = failureRace.find((result) => result.status === "rejected");
    expect(failureSuccess?.status).toBe("fulfilled");
    expect(failureRejected?.status).toBe("rejected");
    if (failureSuccess?.status === "fulfilled") committedGameIds.add(failureSuccess.value.id);
    if (failureRejected?.status === "rejected") expect(failureRejected.reason).toBe(injectedFailure);
    state = await queryGameState();
    expect(state.games).toHaveLength(5);
    expect(state.games.map((game) => game.sequenceNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(state.groupedResults).toHaveLength(5);
    expect(state.groupedResults.every((result) => result._count._all === 4)).toBe(true);
    expect(state.createAudits).toBe(5);
    expect(state.games.some((game) => game.idempotencyKey === failingKey)).toBe(false);
    expect(state.session?.status).toBe(TableSessionStatus.ACTIVE);
    expect(state.visits).toHaveLength(4);
    expect(state.visits.every((visit) => visit.status === VisitStatus.PLAYING)).toBe(true);
    expect(state.seats).toHaveLength(4);
  }, 90_000);
});
