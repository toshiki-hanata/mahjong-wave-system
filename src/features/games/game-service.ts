import "server-only";

import { Prisma, GameStatus, TableSessionStatus, VisitStatus, type PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { calculateGame, type GameRule, type ScoredPlayer } from "./game-calculation";
import { lockBusinessStore, requireOpenBusinessDay } from "@/features/business-days/business-day-service";
import { seatingToken } from "@/features/tables/seat-snapshot";

type Database = Pick<PrismaClient, "$transaction">;
type Context = { storeId: string; staffId: string };
type RuleInput = Omit<GameRule, "tieBreakRule" | "roundingMode"> & { tieBreakRule: "POSITION_ASC"; roundingMode: "NONE" | "HALF_UP" | "DOWN"; isProvisional: boolean };
type PointInput = { position: number; finalPoints: number }[];

export class GameSessionUnavailableError extends Error {}
export class GameSeatIntegrityError extends Error {}
export class GameRuleUnavailableError extends Error {}
export class GameIdempotencyConflictError extends Error {}
export class GameNotCorrectableError extends Error {}
export class GameEntryChangedError extends Error {}

const ruleSelect = {
  id: true, version: true, startingPoints: true, returnPoints: true,
  umaFirst: true, umaSecond: true, umaThird: true, umaFourth: true,
  okaTop: true, pointUnit: true, requiredTotal: true, allowNegative: true,
  tieBreakRule: true, scorePointDivisor: true, scorePrecision: true, roundingMode: true, isProvisional: true,
} as const;

function toRule(rule: {
  startingPoints: number; returnPoints: number; umaFirst: number; umaSecond: number;
  umaThird: number; umaFourth: number; okaTop: number; pointUnit: number;
  requiredTotal: number; allowNegative: boolean; tieBreakRule: "POSITION_ASC";
  scorePointDivisor: number; scorePrecision: number; roundingMode: "NONE" | "HALF_UP" | "DOWN";
}): GameRule { return rule; }

function normalizedPoints(points: PointInput) {
  return [...points].sort((a, b) => a.position - b.position);
}

async function ensureSessionRule(tx: Prisma.TransactionClient, session: { id: string; storeId: string; storeRuleId: string | null }, storeId: string) {
  if (session.storeRuleId) {
    const rule = await tx.storeRule.findFirst({ where: { id: session.storeRuleId, storeId }, select: ruleSelect });
    if (rule) return rule;
    throw new GameRuleUnavailableError();
  }
  const activeRule = await tx.storeRule.findFirst({ where: { storeId, isActive: true }, orderBy: { version: "desc" }, select: ruleSelect });
  if (!activeRule) throw new GameRuleUnavailableError();
  await tx.tableSession.updateMany({ where: { id: session.id, storeId, storeRuleId: null }, data: { storeRuleId: activeRule.id } });
  return activeRule;
}

export async function createStoreRuleVersion(database: Database, input: RuleInput, context: Context): Promise<number> {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${context.storeId} FOR UPDATE`;
    const previous = await tx.storeRule.findFirst({ where: { storeId: context.storeId, isActive: true }, orderBy: { version: "desc" } });
    const version = (previous?.version ?? 0) + 1;
    if (previous) await tx.storeRule.update({ where: { id: previous.id }, data: { isActive: false } });
    const rule = await tx.storeRule.create({
      data: { ...input, storeId: context.storeId, version, isActive: true, createdByStaffId: context.staffId },
      select: { id: true, version: true },
    });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "STORE_RULE_CREATE", entityType: "StoreRule", entityId: rule.id, metadata: { version } }, tx);
    return rule.version;
  });
}

export async function createGame(database: Database, input: { tableSessionId: string; idempotencyKey: string; expectedSequence: number; seatingToken: string; points: PointInput }, context: Context): Promise<{ id: string; sequenceNumber: number; replayed: boolean }> {
  const submitted = normalizedPoints(input.points);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const locked = await tx.$queryRaw<Array<{ id: string; storeId: string; status: TableSessionStatus; storeRuleId: string | null; businessDayId: string | null }>>`
      SELECT "id", "storeId", "status", "storeRuleId", "businessDayId" FROM "TableSession"
      WHERE "id" = ${input.tableSessionId} AND "storeId" = ${context.storeId} FOR UPDATE`;
    const session = locked[0];
    if (!session) throw new GameSessionUnavailableError();
    const existing = await tx.game.findFirst({
      where: { storeId: context.storeId, tableSessionId: input.tableSessionId, idempotencyKey: input.idempotencyKey },
      include: { results: { select: { position: true, finalPoints: true } } },
    });
    if (existing) {
      const prior = [...existing.results].sort((a, b) => a.position - b.position);
      if (existing.sequenceNumber !== input.expectedSequence || prior.length !== submitted.length || prior.some((row, i) => row.position !== submitted[i]?.position || row.finalPoints !== submitted[i]?.finalPoints)) throw new GameIdempotencyConflictError();
      return { id: existing.id, sequenceNumber: existing.sequenceNumber, replayed: true };
    }
    if (session.status !== TableSessionStatus.ACTIVE) throw new GameSessionUnavailableError();
    const businessDay = await requireOpenBusinessDay(tx, context.storeId);
    if (session.businessDayId !== businessDay.id) throw new GameSessionUnavailableError();
    const usingLegacySession = session.storeRuleId === null;
    const rule = await ensureSessionRule(tx, session, context.storeId);
    if (usingLegacySession) await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "TABLE_SESSION_RULE_BIND", entityType: "TableSession", entityId: session.id, metadata: { ruleVersion: rule.version } }, tx);
    const seats = await tx.tableSeat.findMany({
      where: { storeId: context.storeId, tableSessionId: session.id, removedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, position: true, visitId: true, visit: { select: { id: true, storeId: true, customerId: true, status: true, customer: { select: { id: true, storeId: true, isActive: true } } } } },
    });
    if (seats.length !== 4 || ![1, 2, 3, 4].every((position) => seats.filter((seat) => seat.position === position).length === 1)) throw new GameSeatIntegrityError();
    if (seatingToken(seats) !== input.seatingToken) throw new GameEntryChangedError();
    if (seats.some((seat) => seat.visit.status !== VisitStatus.PLAYING || !seat.visit.customer.isActive || seat.visit.storeId !== context.storeId || seat.visit.customer.storeId !== context.storeId)) throw new GameSeatIntegrityError();
    const positionInputs = submitted.map((point) => ({ ...point, seat: seats.find((seat) => seat.position === point.position) }));
    if (positionInputs.some((point) => !point.seat)) throw new GameSeatIntegrityError();
    const players: ScoredPlayer[] = positionInputs.map(({ position, finalPoints, seat }) => ({ visitId: seat!.visitId, customerId: seat!.visit.customerId, position, finalPoints }));
    const gameRule = toRule(rule);
    const results = calculateGame(players, gameRule);
    const maxSequence = await tx.game.aggregate({ where: { storeId: context.storeId, tableSessionId: session.id }, _max: { sequenceNumber: true } });
    const sequenceNumber = (maxSequence._max.sequenceNumber ?? 0) + 1;
    if (sequenceNumber !== input.expectedSequence) throw new GameEntryChangedError();
    const confirmedAt = new Date();
    const ruleSnapshot = { ...rule, calculationVersion: "POINTS_RETURN_UMA_OKA_V1", scoreUnit: `1.0 = ${rule.scorePointDivisor} points`, scoreFormula: "(finalPoints - returnPoints) / scorePointDivisor + umaByRank + topOka", capturedAt: new Date().toISOString() } satisfies Prisma.InputJsonObject;
    const game = await tx.game.create({
      data: {
        storeId: context.storeId, tableSessionId: session.id, storeRuleId: rule.id,
        businessDayId: businessDay.id, freeGamePriceYen: businessDay.freeGamePriceYen,
        sequenceNumber, revisionNumber: 1, idempotencyKey: input.idempotencyKey,
        ruleSnapshot, createdByStaffId: context.staffId, confirmedAt, effectiveAt: confirmedAt,
        results: { create: results.map((result) => ({ visitId: result.visitId, customerId: result.customerId, position: result.position, finalPoints: result.finalPoints, rank: result.rank, scoreScaled: result.scoreScaled })) },
      }, select: { id: true, sequenceNumber: true },
    });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "GAME_RESULT_CREATE", entityType: "Game", entityId: game.id, metadata: { sequenceNumber, ruleVersion: rule.version } }, tx);
    return { ...game, replayed: false };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function correctGame(database: Database, input: { gameId: string; idempotencyKey: string; reason: string; points: PointInput }, context: Context): Promise<{ id: string; sequenceNumber: number }> {
  const submitted = normalizedPoints(input.points);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const originalRef = await tx.game.findFirst({ where: { id: input.gameId, storeId: context.storeId }, select: { tableSessionId: true } });
    if (!originalRef) throw new GameNotCorrectableError();
    const sessionRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TableSession" WHERE "id" = ${originalRef.tableSessionId} AND "storeId" = ${context.storeId} FOR UPDATE`;
    if (!sessionRows.length) throw new GameNotCorrectableError();
    const priorRetry = await tx.game.findFirst({ where: { storeId: context.storeId, tableSessionId: originalRef.tableSessionId, idempotencyKey: input.idempotencyKey }, include: { results: { select: { position: true, finalPoints: true } }, originalGame: { select: { id: true, correctionReason: true } } } });
    if (priorRetry) {
      const prior = [...priorRetry.results].sort((a, b) => a.position - b.position);
      if (priorRetry.originalGame?.id !== input.gameId || priorRetry.originalGame.correctionReason !== input.reason || prior.length !== submitted.length || prior.some((row, index) => row.position !== submitted[index]?.position || row.finalPoints !== submitted[index]?.finalPoints)) throw new GameIdempotencyConflictError();
      return { id: priorRetry.id, sequenceNumber: priorRetry.sequenceNumber };
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Game" WHERE "id" = ${input.gameId} AND "storeId" = ${context.storeId} FOR UPDATE`;
    if (!rows.length) throw new GameNotCorrectableError();
    const original = await tx.game.findFirst({ where: { id: input.gameId, storeId: context.storeId }, include: { results: true } });
    if (!original || original.status !== GameStatus.CONFIRMED || original.correctedByGameId || original.results.length !== 4) throw new GameNotCorrectableError();
    const priorResults = [...original.results].sort((a, b) => a.position - b.position);
    if (submitted.some((point, index) => point.position !== priorResults[index]?.position)) throw new GameSeatIntegrityError();
    const snapshot = original.ruleSnapshot as unknown as GameRule & { version: number };
    const players = submitted.map((point, index) => ({ visitId: priorResults[index]!.visitId, customerId: priorResults[index]!.customerId, position: point.position, finalPoints: point.finalPoints }));
    const results = calculateGame(players, snapshot);
    const game = await tx.game.create({
      data: {
        storeId: context.storeId, tableSessionId: original.tableSessionId, storeRuleId: original.storeRuleId,
        businessDayId: original.businessDayId, freeGamePriceYen: original.freeGamePriceYen,
        sequenceNumber: original.sequenceNumber, revisionNumber: original.revisionNumber + 1, status: GameStatus.DRAFT,
        idempotencyKey: input.idempotencyKey, ruleSnapshot: original.ruleSnapshot as Prisma.InputJsonValue,
        createdByStaffId: context.staffId, effectiveAt: original.effectiveAt,
        results: { create: results.map((result) => ({ visitId: result.visitId, customerId: result.customerId, position: result.position, finalPoints: result.finalPoints, rank: result.rank, scoreScaled: result.scoreScaled })) },
      }, select: { id: true, sequenceNumber: true },
    });
    await tx.game.update({ where: { id: original.id }, data: { status: GameStatus.CORRECTED, correctedByGameId: game.id, correctedByStaffId: context.staffId, correctedAt: new Date(), correctionReason: input.reason } });
    await tx.game.update({ where: { id: game.id }, data: { status: GameStatus.CONFIRMED } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "GAME_RESULT_VOID", entityType: "Game", entityId: original.id, metadata: { replacementGameId: game.id, reason: input.reason } }, tx);
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "GAME_RESULT_CORRECT", entityType: "Game", entityId: game.id, metadata: { originalGameId: original.id, sequenceNumber: game.sequenceNumber, reason: input.reason } }, tx);
    return game;
  });
}
