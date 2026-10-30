import "server-only";
import type { PrismaClient } from "@prisma/client";
import { parseRoster, reconcileRoster, type RosterResult } from "./roster-reconciliation";

export type RosterPreview = { message?: string; results?: RosterResult[] };
const MAX_CUSTOMERS_TO_SCAN = 10_000;

/** Read-only. Does not merge customers, create visits, link credentials or migrate points. */
export async function previewRoster(database: Pick<PrismaClient, "customer">, storeId: string, text: unknown): Promise<RosterPreview> {
  const parsed = parseRoster(text);
  if (!parsed.ok) return { message: parsed.message };
  const customers = await database.customer.findMany({
    where: { storeId, participantStaffId: null },
    orderBy: [{ internalName: "asc" }, { customerCode: "asc" }], take: MAX_CUSTOMERS_TO_SCAN + 1,
    select: { id: true, internalName: true, customerCode: true, isActive: true },
  });
  if (customers.length > MAX_CUSTOMERS_TO_SCAN) return { message: "店舗の名簿が照合上限を超えています。通常の顧客検索で確認してください。" };
  return { results: reconcileRoster(parsed.rows, customers) };
}
