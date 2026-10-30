import "server-only";
import type { PrismaClient } from "@prisma/client";
import { calculateCustomerPerformance, scorePrecisionFromSnapshot } from "@/features/rankings/ranking-metrics";

export async function getAvailableStaffParticipants(database: Pick<PrismaClient, "staff"> | null, storeId: string) {
  if (!database) return [];
  return database.staff.findMany({ where: { storeId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
}

export async function getStaffParticipationData(database: PrismaClient | null, context: { storeId: string; staffId: string }, businessDayId?: string) {
  if (!database) return null;
  return database.$transaction(async (tx) => {
    const actor = await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true }, select: { role: true } });
    if (!actor) return null;
    const canViewAll = actor.role === "OWNER" || actor.role === "MANAGER";
    const days = await tx.businessDay.findMany({ where: { storeId: context.storeId }, orderBy: { openedAt: "desc" }, take: 30, select: { id: true, label: true, openedAt: true, closedAt: true, timezone: true } });
    const selectedDay = businessDayId ? days.find((day) => day.id === businessDayId) : days.find((day) => !day.closedAt) ?? days[0];
    if (businessDayId && !selectedDay) return null;
    const staff = await tx.staff.findMany({
      where: { storeId: context.storeId, ...(canViewAll ? {} : { id: context.staffId }) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, isActive: true, participantProfile: { select: { id: true, internalName: true, isActive: true } } },
    });
    const results = staff.length ? await tx.gamePlayerResult.findMany({
      where: { storeId: context.storeId, customer: { is: { storeId: context.storeId, participantStaffId: { in: staff.map((person) => person.id) } } }, game: { is: { storeId: context.storeId, status: "CONFIRMED" } } },
      select: { customerId: true, position: true, rank: true, finalPoints: true, scoreScaled: true, game: { select: { id: true, businessDayId: true, effectiveAt: true, sequenceNumber: true, ruleSnapshot: true, tableSession: { select: { mahjongTable: { select: { name: true } } } } } } },
      orderBy: [{ game: { effectiveAt: "desc" } }, { gameId: "desc" }],
    }) : [];
    return {
      canViewAll, days, selectedDay: selectedDay ?? null,
      staff: staff.map((person) => {
        const rows = results.filter((result) => result.customerId === person.participantProfile?.id);
        const profile = person.participantProfile ?? { id: `no-profile-${person.id}`, internalName: person.name, isActive: person.isActive };
        const stats = calculateCustomerPerformance(rows.map((row) => ({
          gameId: row.game.id, customerId: row.customerId, effectiveAt: row.game.effectiveAt, rank: row.rank,
          finalPoints: row.finalPoints, scoreScaled: row.scoreScaled, scorePrecision: scorePrecisionFromSnapshot(row.game.ruleSnapshot),
        })), profile);
        return {
          id: person.id, name: person.name, isActive: person.isActive, stats,
          dayGames: selectedDay ? rows.filter((result) => result.game.businessDayId === selectedDay.id).length : 0,
          recentGames: rows.filter((result) => !selectedDay || result.game.businessDayId === selectedDay.id).slice(0, 10).map((row) => ({
            id: row.game.id, effectiveAt: row.game.effectiveAt, tableName: row.game.tableSession.mahjongTable.name,
            sequenceNumber: row.game.sequenceNumber, rank: row.rank, finalPoints: row.finalPoints,
          })),
        };
      }).filter((person) => person.isActive || person.stats.gamesPlayed > 0),
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}
