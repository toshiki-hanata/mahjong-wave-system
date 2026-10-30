import "server-only";

import { TableSessionStatus, VisitStatus, type PrismaClient } from "@prisma/client";

export type TableDashboardCounts = { activeTables: number; availableTables: number; waiting: number; playing: number };

export async function getTableDashboardCounts(database: Pick<PrismaClient, "mahjongTable" | "tableSession" | "visit"> | null, storeId: string): Promise<TableDashboardCounts | null> {
  if (!database) return null;
  const [activeTables, activeSessions, visitCounts] = await Promise.all([
    database.mahjongTable.count({ where: { storeId, isActive: true } }),
    database.tableSession.count({ where: { storeId, status: TableSessionStatus.ACTIVE, mahjongTable: { is: { isActive: true } } } }),
    database.visit.groupBy({ by: ["status"], where: { storeId, status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } }, _count: { _all: true } }),
  ]);
  const waiting = visitCounts.find((row) => row.status === VisitStatus.WAITING)?._count._all ?? 0;
  const playing = visitCounts.find((row) => row.status === VisitStatus.PLAYING)?._count._all ?? 0;
  return { activeTables, availableTables: Math.max(0, activeTables - activeSessions), waiting, playing };
}

export async function getTablePageData(database: Pick<PrismaClient, "mahjongTable" | "visit" | "tableSession"> | null, storeId: string) {
  if (!database) return { tables: [], waitingVisits: [], recentSessions: [] };
  const [tables, waitingVisits, recentSessions] = await Promise.all([
    database.mahjongTable.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, sortOrder: true, isActive: true,
        sessions: {
          where: { status: TableSessionStatus.ACTIVE }, take: 1,
          select: {
            id: true, startedAt: true,
            _count: { select: { games: { where: { status: "CONFIRMED" } } } },
            seats: {
              where: { removedAt: null }, orderBy: { position: "asc" },
              select: { id: true, position: true, visitId: true, visit: { select: { status: true, customer: { select: { id: true, customerCode: true, internalName: true, participantStaffId: true, isActive: true } } } } },
            },
          },
        },
      },
    }),
    database.visit.findMany({
      where: { storeId, status: VisitStatus.WAITING, customer: { is: { isActive: true, OR: [{ participantStaffId: null }, { participantStaff: { is: { isActive: true } } }] } } },
      orderBy: { checkedInAt: "asc" },
      select: { id: true, checkedInAt: true, customer: { select: { customerCode: true, internalName: true, participantStaffId: true } } },
    }),
    database.tableSession.findMany({ where: { storeId }, orderBy: { startedAt: "desc" }, take: 20, select: { id: true, status: true, startedAt: true, endedAt: true, mahjongTable: { select: { name: true } }, _count: { select: { games: { where: { status: "CONFIRMED" } } } } } }),
  ]);
  return { tables, waitingVisits, recentSessions };
}
