import "server-only";

import type { PrismaClient } from "@prisma/client";
import { readBusinessDayTimeAudit } from "./business-day-time";

export type BusinessDayMetrics = { games: number; revenueYen: number; visits: number; customers: number };

export function summarizeBusinessGames(rows: readonly { count: number; priceYen: number }[]) {
  return rows.reduce((total, row) => ({ games: total.games + row.count, revenueYen: total.revenueYen + row.count * row.priceYen }), { games: 0, revenueYen: 0 });
}

export async function getBusinessDayPageData(database: PrismaClient | null, storeId: string, includeTimeHistory = false) {
  if (!database) return null;
  return database.$transaction(async (tx) => {
    const days = await tx.businessDay.findMany({ where: { storeId }, orderBy: { openedAt: "desc" }, take: 10 });
    const ids = days.map((day) => day.id);
    const timeLogs = includeTimeHistory ? await tx.auditLog.findMany({
      where: { storeId, entityType: "BusinessDay", entityId: { in: ids }, action: "BUSINESS_DAY_TIME_UPDATE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, entityId: true, createdAt: true, metadata: true, actor: { select: { name: true } } },
    }) : [];
    const games = await tx.game.groupBy({ by: ["businessDayId", "tableSessionId", "freeGamePriceYen"], where: { storeId, businessDayId: { in: ids }, status: "CONFIRMED" }, _count: { _all: true } });
    const visits = await tx.visit.groupBy({ by: ["businessDayId", "customerId"], where: { storeId, businessDayId: { in: ids } }, _count: { _all: true } });
    const sessions = await tx.tableSession.findMany({ where: { storeId, businessDayId: { in: ids } }, select: { id: true, mahjongTableId: true, mahjongTable: { select: { name: true } } } });
    const store = await tx.store.findUnique({ where: { id: storeId }, select: { freeGamePriceYen: true } });
    const openVisits = await tx.visit.count({ where: { storeId, status: { in: ["WAITING", "PLAYING"] } } });
    const activeTables = await tx.tableSession.count({ where: { storeId, status: "ACTIVE" } });
    return {
      nextPriceYen: store?.freeGamePriceYen ?? 2500, openVisits, activeTables,
      days: days.map((day) => {
        const gameRows = games.filter((row) => row.businessDayId === day.id);
        const customerRows = visits.filter((row) => row.businessDayId === day.id);
        const tables = new Map<string, { id: string; name: string; games: number; revenueYen: number }>();
        for (const row of gameRows) {
          const session = sessions.find((item) => item.id === row.tableSessionId);
          if (!session) continue;
          const current = tables.get(session.mahjongTableId) ?? { id: session.mahjongTableId, name: session.mahjongTable.name, games: 0, revenueYen: 0 };
          current.games += row._count._all;
          current.revenueYen += row._count._all * (row.freeGamePriceYen ?? 0);
          tables.set(current.id, current);
        }
        return {
          ...day,
          timeHistory: timeLogs.filter((log) => log.entityId === day.id).flatMap((log) => {
            const change = readBusinessDayTimeAudit(log.metadata);
            return change ? [{ id: log.id, at: log.createdAt, staffName: log.actor?.name ?? "退職・削除済みの担当者", change }] : [];
          }),
          metrics: { ...summarizeBusinessGames(gameRows.map((row) => ({ count: row._count._all, priceYen: row.freeGamePriceYen ?? 0 }))), visits: customerRows.reduce((sum, row) => sum + row._count._all, 0), customers: customerRows.length },
          tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true })),
        };
      }),
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 15_000 });
}
