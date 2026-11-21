import "server-only";
import type { PrismaClient, Prisma } from "@prisma/client";
import { calculateCustomerPerformance, scorePrecisionFromSnapshot } from "@/features/rankings/ranking-metrics";
import { requireMemberSession } from "./portal-session";
import { getRankingPeriodBounds } from "@/features/rankings/ranking-period";
export async function getMemberPortalData(database: PrismaClient, token: unknown, page = 1, now = new Date()) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) page = 1;
  return database.$transaction(async tx => {
    const subject = await requireMemberSession(tx, token, false, now);
    const customer = await tx.customer.findUniqueOrThrow({ where: { storeId_id: { storeId: subject.storeId, id: subject.customerId } }, select: { customerCode: true, publicProfile: { select: { nickname: true } }, store: { select: { name: true, timezone: true } } } });
    const day = await tx.businessDay.findFirst({ where: { storeId: subject.storeId }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { id: true, label: true, closedAt: true } });
    const base: Prisma.GamePlayerResultWhereInput = { storeId: subject.storeId, customerId: subject.customerId, game: { storeId: subject.storeId, status: "CONFIRMED" } };
    const summarize = async (extra: Prisma.GameWhereInput = {}) => {
      const where: Prisma.GamePlayerResultWhereInput = { ...base, game: { storeId: subject.storeId, status: "CONFIRMED", ...extra } };
      const rows = await tx.gamePlayerResult.findMany({ where, select: { gameId: true, customerId: true, rank: true, finalPoints: true, scoreScaled: true, game: { select: { effectiveAt: true, ruleSnapshot: true } } } });
      const stats = calculateCustomerPerformance(rows.map(r => ({ gameId: r.gameId, customerId: r.customerId, rank: r.rank, finalPoints: r.finalPoints, scoreScaled: r.scoreScaled, effectiveAt: r.game.effectiveAt, scorePrecision: scorePrecisionFromSnapshot(r.game.ruleSnapshot) })), { id: subject.customerId, internalName: "", isActive: true });
      return { games: stats.gamesPlayed, averageRank: stats.averageRank, tops: stats.firsts, topRate: stats.topRate, scoredGames: stats.scoredGames, scoreTotal: stats.scoreTotal };
    };
    const month = getRankingPeriodBounds("month", undefined, customer.store.timezone, now)!, year = getRankingPeriodBounds("year", undefined, customer.store.timezone, now)!;
    const [daily, monthly, yearly, lifetime, history, balance, points, migration, credentials] = await Promise.all([
      day ? summarize({ businessDayId: day.id }) : null, summarize({ effectiveAt: { gte: month.start, lt: month.end } }), summarize({ effectiveAt: { gte: year.start, lt: year.end } }), summarize(),
      tx.gamePlayerResult.findMany({ where: base, orderBy: [{ game: { effectiveAt: "desc" } }, { gameId: "desc" }], skip: (page - 1) * 20, take: 21, select: { id: true, rank: true, finalPoints: true, scoreScaled: true, game: { select: { effectiveAt: true, sequenceNumber: true, ruleSnapshot: true, businessDay: { select: { label: true } } } } } }),
      tx.pointLedgerEntry.aggregate({ where: { storeId: subject.storeId, customerId: subject.customerId }, _sum: { delta: true } }),
      tx.pointLedgerEntry.findMany({ where: { storeId: subject.storeId, customerId: subject.customerId }, orderBy: { sequenceNumber: "desc" }, take: 50, select: { id: true, kind: true, delta: true, balanceAfter: true, createdAt: true, legacyChange: { select: { kind: true } } } }),
      tx.legacyPointMigration.findUnique({ where: { storeId_customerId: { storeId: subject.storeId, customerId: subject.customerId } }, select: { changes: { orderBy: { revision: "desc" }, take: 1, select: { importedAmount: true } } } }),
      tx.customerPasskey.findMany({ where: { storeId: subject.storeId, customerId: subject.customerId, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
    ]);
    // Only this customer's DTO leaves the data layer. No internal names, notes, staff names, reasons, or opponents.
    return { customerCode: customer.customerCode, nickname: customer.publicProfile?.nickname ?? "会員", storeName: customer.store.name, timezone: customer.store.timezone, day: day ? { label: day.label, closed: Boolean(day.closedAt) } : null, daily, monthly, yearly, lifetime, monthLabel: month.label, yearLabel: year.label, history: history.slice(0, 20).map(row => ({ id: row.id, rank: row.rank, finalPoints: row.finalPoints, scoreScaled: row.scoreScaled, scorePrecision: scorePrecisionFromSnapshot(row.game.ruleSnapshot), at: row.game.effectiveAt, sequence: row.game.sequenceNumber, businessDayLabel: row.game.businessDay?.label ?? null })), page, hasMore: history.length > 20, balance: balance._sum.delta ?? 0, migratedAmount: migration?.changes[0]?.importedAmount ?? null, points: points.map(p => ({ id: p.id, delta: p.delta, balanceAfter: p.balanceAfter, createdAt: p.createdAt, label: p.legacyChange ? (p.legacyChange.kind === "INITIAL" ? "旧ポイント引継ぎ" : "引継ぎの訂正") : p.kind === "REVERSE" ? "ポイント調整の取消" : "ポイントの調整" })), credentials, recoveryAcknowledged: subject.recoveryAcknowledged };
  }, { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 });
}
