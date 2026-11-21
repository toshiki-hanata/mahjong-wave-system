import "server-only";
import type { PrismaClient } from "@prisma/client";
type Database = Pick<PrismaClient, "tableSession" | "visit">;
export async function getCloseChecklist(database: Database, storeId: string) {
  const [tables, visits] = await Promise.all([
    database.tableSession.findMany({ where: { storeId, status: "ACTIVE" }, orderBy: [{ startedAt: "asc" }, { id: "asc" }], take: 100, select: { id: true, mahjongTableId: true, mahjongTable: { select: { name: true } } } }),
    database.visit.findMany({ where: { storeId, status: { in: ["WAITING", "PLAYING"] } }, orderBy: [{ checkedInAt: "asc" }, { id: "asc" }], take: 100,
      select: { id: true, status: true, customer: { select: { internalName: true, customerCode: true, participantStaffId: true } }, tableSeats: { where: { storeId, removedAt: null, tableSession: { is: { storeId, status: "ACTIVE" } } }, take: 1, select: { tableSession: { select: { mahjongTableId: true, mahjongTable: { select: { name: true } } } } } } },
    }),
  ]);
  return { tables: tables.map(t => ({ id: t.id, name: t.mahjongTable.name, href: `/admin/tables#table-${t.mahjongTableId}` })), visits: visits.map(v => {
    const seat = v.tableSeats[0]?.tableSession;
    return { id: v.id, customer: v.customer, status: v.status, tableName: seat?.mahjongTable.name ?? null, href: v.status === "WAITING" ? `/admin/visits#visit-${v.id}` : seat ? `/admin/tables#table-${seat.mahjongTableId}` : "/admin/tables" };
  }) };
}
