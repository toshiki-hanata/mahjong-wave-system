import "server-only";
import { Prisma } from "@prisma/client";

/** Store must be locked first. Staff security mutations use the same lock order. */
export async function staffParticipantsAreActive(tx: Prisma.TransactionClient, storeId: string, ids: readonly (string | null | undefined)[]) {
  const staffIds = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
  if (!staffIds.length) return true;
  const rows = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`
    SELECT "id", "isActive" FROM "Staff"
    WHERE "storeId" = ${storeId} AND "id" IN (${Prisma.join(staffIds)})
    ORDER BY "id" FOR UPDATE
  `;
  return rows.length === staffIds.length && rows.every((row) => row.isActive);
}
