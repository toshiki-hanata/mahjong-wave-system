import "server-only";

import { GameStatus, type PrismaClient } from "@prisma/client";
import { buildRankingRows, calculateCustomerPerformance, scorePrecisionFromSnapshot, type PerformanceCustomer, type PerformanceResult, type RankingMetricKey } from "./ranking-metrics";
import { getRankingPeriodBounds, type RankingPeriodKind } from "./ranking-period";
import { getRankingSettings } from "./ranking-settings";

type ReadDatabase = Pick<PrismaClient, "customer" | "gamePlayerResult" | "rankingSettings">;

export function buildEffectiveResultWhere(storeId: string, customerId?: string, bounds?: { start: Date; end: Date } | null, activeCustomersOnly = false) {
  return {
    storeId,
    ...(customerId ? { customerId } : {}),
    ...(activeCustomersOnly ? { customer: { is: { storeId, isActive: true } } } : {}),
    game: {
      is: {
        storeId,
        status: GameStatus.CONFIRMED,
        ...(bounds ? { effectiveAt: { gte: bounds.start, lt: bounds.end } } : {}),
      },
    },
  };
}

function toPerformanceResult(row: {
  gameId: string; customerId: string; rank: number; finalPoints: number; scoreScaled: number;
  game: { id: string; effectiveAt: Date; ruleSnapshot: unknown };
}): PerformanceResult {
  return {
    gameId: row.game.id,
    customerId: row.customerId,
    effectiveAt: row.game.effectiveAt,
    rank: row.rank,
    finalPoints: row.finalPoints,
    scoreScaled: row.scoreScaled,
    scorePrecision: scorePrecisionFromSnapshot(row.game.ruleSnapshot),
  };
}

export async function getStoreRankingData(
  database: ReadDatabase | null,
  storeId: string,
  timeZone: string,
  periodKind: RankingPeriodKind,
  periodValue: string | undefined,
  metric: RankingMetricKey,
) {
  const bounds = getRankingPeriodBounds(periodKind, periodValue, timeZone);
  const settings = await getRankingSettings(database, storeId);
  if (!database) return { bounds, settings, minimumGames: minimumFor(periodKind, settings), rows: [] };

  const minimumGames = minimumFor(periodKind, settings);
  const [customers, resultRows] = await Promise.all([
    database.customer.findMany({
      where: { storeId, isActive: true },
      select: { id: true, internalName: true, isActive: true },
      orderBy: [{ internalName: "asc" }, { id: "asc" }],
    }),
    database.gamePlayerResult.findMany({
      where: buildEffectiveResultWhere(storeId, undefined, bounds, true),
      select: {
        gameId: true, customerId: true, rank: true, finalPoints: true, scoreScaled: true,
        game: { select: { id: true, effectiveAt: true, ruleSnapshot: true } },
      },
    }),
  ]);
  const results = resultRows.map(toPerformanceResult);
  const rows = buildRankingRows(customers, results, minimumGames, metric);
  return { bounds, settings, minimumGames, rows };
}

function minimumFor(period: RankingPeriodKind, settings: { monthlyMinimumGames: number; annualMinimumGames: number; lifetimeMinimumGames: number }): number {
  if (period === "month") return settings.monthlyMinimumGames;
  if (period === "year") return settings.annualMinimumGames;
  return settings.lifetimeMinimumGames;
}

export async function getCustomerPerformance(
  database: ReadDatabase | null,
  storeId: string,
  customerId: string,
  timeZone: string,
  now = new Date(),
) {
  if (!database) return null;
  const customer = await database.customer.findFirst({
    where: { id: customerId, storeId },
    select: { id: true, internalName: true, customerCode: true, isActive: true },
  });
  if (!customer) return null;
  const rawRows = await database.gamePlayerResult.findMany({
    where: buildEffectiveResultWhere(storeId, customerId),
    select: {
      gameId: true, customerId: true, rank: true, finalPoints: true, scoreScaled: true,
      game: {
        select: {
          id: true, effectiveAt: true, ruleSnapshot: true, sequenceNumber: true,
          tableSession: { select: { mahjongTable: { select: { name: true } } } },
        },
      },
    },
  });
  const results = rawRows.map(toPerformanceResult);
  const performanceCustomer: PerformanceCustomer = customer;
  const allTime = calculateCustomerPerformance(results, performanceCustomer);
  const monthBounds = getRankingPeriodBounds("month", undefined, timeZone, now)!;
  const monthResults = results.filter((result) => result.effectiveAt >= monthBounds.start && result.effectiveAt < monthBounds.end);
  const month = calculateCustomerPerformance(monthResults, performanceCustomer);
  const recentGames = [...rawRows]
    .sort((a, b) => b.game.effectiveAt.getTime() - a.game.effectiveAt.getTime() || b.game.id.localeCompare(a.game.id))
    .slice(0, 10)
    .map((row) => ({
      id: row.game.id,
      sequenceNumber: row.game.sequenceNumber,
      effectiveAt: row.game.effectiveAt,
      rank: row.rank,
      finalPoints: row.finalPoints,
      scoreScaled: row.scoreScaled,
      scorePrecision: scorePrecisionFromSnapshot(row.game.ruleSnapshot),
      tableName: row.game.tableSession.mahjongTable.name,
    }));
  return { customer, allTime, month, recentGames, monthLabel: monthBounds.label };
}

export const RANKING_METRIC_LABELS: Record<RankingMetricKey, string> = {
  scoreTotal: "score合計",
  averageRank: "平均順位",
  topRate: "トップ率",
  reachRate: "連対率",
  bustAvoidanceRate: "ラス回避率",
  gamesPlayed: "半荘数",
  maxWinStreak: "最大連勝",
};
