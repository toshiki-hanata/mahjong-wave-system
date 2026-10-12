import "server-only";

import { VisitStatus, type PrismaClient } from "@prisma/client";

export type VisitStatusCounts = { total: number; waiting: number; playing: number };

export async function getVisitStatusCounts(
  database: Pick<PrismaClient, "visit"> | null,
  storeId: string,
): Promise<VisitStatusCounts | null> {
  if (!database) return null;
  const rows = await database.visit.groupBy({
    by: ["status"],
    where: { storeId, status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } },
    _count: { _all: true },
  });
  const waiting = rows.find((row) => row.status === VisitStatus.WAITING)?._count._all ?? 0;
  const playing = rows.find((row) => row.status === VisitStatus.PLAYING)?._count._all ?? 0;
  return { total: waiting + playing, waiting, playing };
}

export async function getOpenVisits(
  database: Pick<PrismaClient, "visit"> | null,
  storeId: string,
) {
  if (!database) return [];
  return database.visit.findMany({
    where: { storeId, status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } },
    orderBy: { checkedInAt: "asc" },
    select: {
      id: true,
      checkedInAt: true,
      status: true,
      customer: { select: { id: true, customerCode: true, internalName: true } },
    },
  });
}

export function formatVisitDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
