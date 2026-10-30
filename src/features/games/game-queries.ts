import "server-only";

import type { PrismaClient } from "@prisma/client";
import { seatingToken } from "@/features/tables/seat-snapshot";

export async function getStoreRules(database: Pick<PrismaClient, "storeRule"> | null, storeId: string) {
  if (!database) return [];
  return database.storeRule.findMany({ where: { storeId }, orderBy: { version: "desc" } });
}

export async function getGameEntryData(database: Pick<PrismaClient, "tableSession" | "storeRule" | "game"> | null, storeId: string, tableSessionId: string) {
  if (!database) return null;
  const session = await database.tableSession.findFirst({
    where: { id: tableSessionId, storeId },
    include: {
      mahjongTable: { select: { name: true } },
      storeRule: true,
      seats: { where: { removedAt: null }, orderBy: { position: "asc" }, select: { id: true, visitId: true, position: true, visit: { select: { id: true, storeId: true, customerId: true, status: true, customer: { select: { id: true, storeId: true, internalName: true, participantStaffId: true, customerCode: true, isActive: true } } } } } },
    },
  });
  if (!session) return null;
  const rule = session.storeRule ?? await database.storeRule.findFirst({ where: { storeId, isActive: true }, orderBy: { version: "desc" } });
  const max = await database.game.aggregate({ where: { storeId, tableSessionId }, _max: { sequenceNumber: true } });
  return { session, rule, nextSequence: (max._max.sequenceNumber ?? 0) + 1, seatingToken: seatingToken(session.seats) };
}

export async function getSessionGames(database: Pick<PrismaClient, "tableSession" | "game"> | null, storeId: string, tableSessionId: string) {
  if (!database) return null;
  return database.tableSession.findFirst({
    where: { id: tableSessionId, storeId },
    include: {
      mahjongTable: { select: { name: true } },
      games: { orderBy: [{ sequenceNumber: "asc" }, { revisionNumber: "asc" }], include: { results: { orderBy: { position: "asc" }, include: { customer: { select: { customerCode: true, internalName: true, participantStaffId: true } } } } } },
    },
  });
}

export async function getRecentTableSessions(database: Pick<PrismaClient, "tableSession"> | null, storeId: string) {
  if (!database) return [];
  return database.tableSession.findMany({
    where: { storeId }, orderBy: { startedAt: "desc" }, take: 20,
    select: { id: true, status: true, startedAt: true, endedAt: true, mahjongTable: { select: { name: true } }, _count: { select: { games: true } } },
  });
}

export async function getGameDetail(database: Pick<PrismaClient, "game"> | null, storeId: string, gameId: string) {
  if (!database) return null;
  return database.game.findFirst({
    where: { id: gameId, storeId },
    include: {
      tableSession: { include: { mahjongTable: { select: { name: true } } } },
      results: { orderBy: { position: "asc" }, include: { customer: { select: { customerCode: true, internalName: true, participantStaffId: true } } } },
      correctedGame: { select: { id: true, sequenceNumber: true, revisionNumber: true } },
      originalGame: { select: { id: true, sequenceNumber: true, revisionNumber: true } },
    },
  });
}
