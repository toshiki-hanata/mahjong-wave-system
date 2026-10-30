import "server-only";
import type { PrismaClient } from "@prisma/client";

/** The staff home uses only its store's persisted operational records. */
export async function getDashboardData(database: PrismaClient | null, storeId: string) {
  if (!database) return null;
  return database.$transaction(async (tx) => {
    const currentDay = await tx.businessDay.findFirst({
      where: { storeId, closedAt: null },
      select: { id: true, label: true, openedAt: true, timezone: true, freeGamePriceYen: true },
    });
    const tables = await tx.mahjongTable.findMany({
      where: { storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sessions: {
        where: { storeId, status: "ACTIVE" }, take: 1,
        select: { id: true, startedAt: true, seats: {
          where: { storeId, removedAt: null }, orderBy: { position: "asc" },
          select: { position: true, visit: { select: { customer: { select: { internalName: true } } } } },
        } },
      } },
    });
    const openVisits = await tx.visit.groupBy({
      by: ["status"], where: { storeId, status: { in: ["WAITING", "PLAYING"] } }, _count: { _all: true },
    });
    const games = currentDay ? await tx.game.aggregate({
      where: { storeId, businessDayId: currentDay.id, status: "CONFIRMED" },
      _count: { _all: true }, _sum: { freeGamePriceYen: true },
    }) : null;
    const customers = currentDay ? await tx.visit.groupBy({
      by: ["customerId"], where: { storeId, businessDayId: currentDay.id }, _count: { _all: true },
    }) : [];
    const recentGames = currentDay ? await tx.game.findMany({
      where: { storeId, businessDayId: currentDay.id, status: "CONFIRMED" },
      orderBy: [{ effectiveAt: "desc" }, { id: "desc" }], take: 5,
      select: { id: true, tableSessionId: true, sequenceNumber: true, effectiveAt: true, tableSession: { select: { mahjongTable: { select: { name: true } } } } },
    }) : [];
    const waiting = openVisits.find((row) => row.status === "WAITING")?._count._all ?? 0;
    const playing = openVisits.find((row) => row.status === "PLAYING")?._count._all ?? 0;
    const activeTables = tables.filter((table) => table.sessions.length > 0).length;
    return {
      source: "database" as const, currentDay, tables, recentGames,
      waiting, playing, activeTables, availableTables: tables.length - activeTables,
      metrics: games ? { games: games._count._all, revenueYen: games._sum.freeGamePriceYen ?? 0, customers: customers.length } : null,
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 15_000 });
}

export type OperationalDashboardData = NonNullable<Awaited<ReturnType<typeof getDashboardData>>>;
