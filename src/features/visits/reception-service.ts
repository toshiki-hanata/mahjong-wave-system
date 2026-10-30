import "server-only";

import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { checkInVisitInTransaction, VisitCustomerUnavailableError } from "./visit-service";
import { quickReceptionSchema, receptionNameKey, type QuickReceptionInput } from "./reception-schemas";
import { requireOpenBusinessDay } from "@/features/business-days/business-day-service";

export type ReceptionCandidate = {
  id: string; customerCode: string; internalName: string; isActive: boolean;
};

export class ReceptionNameExistsError extends Error {
  constructor(public readonly candidates: ReceptionCandidate[]) {
    super("同じお名前の登録があります。既存のお客さんか確認してください。");
    this.name = "ReceptionNameExistsError";
  }
}

export class ReceptionRequestConflictError extends Error {}

/** Include inactive customers and non-consecutive codes; never reuse a historical code. */
export function nextReceptionCode(codes: readonly string[]): string {
  const maximum = codes.reduce((max, code) => {
    const match = /^W(\d+)$/i.exec(code);
    const value = match ? BigInt(match[1]) : BigInt(0);
    return value > max ? value : max;
  }, BigInt(0));
  const next = `W${(maximum + BigInt(1)).toString().padStart(4, "0")}`;
  if (next.length > 80) throw new Error("顧客コードの採番上限です。管理者に確認してください。");
  return next;
}

export async function registerAndCheckIn(
  database: Pick<PrismaClient, "$transaction">,
  rawInput: QuickReceptionInput,
  context: { storeId: string; staffId: string },
) {
  const input = quickReceptionSchema.parse(rawInput);
  // The namespace prevents a submitted request ID from referring to an ordinary customer.
  const customerId = `reception-${context.storeId}-${input.requestId}`;
  return database.$transaction(async (tx) => {
    // Serialize quick registration per store: same-name checks and code allocation share the lock.
    const stores = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Store" WHERE "id" = ${context.storeId} AND "isActive" = true FOR UPDATE
    `;
    if (stores.length !== 1) throw new VisitCustomerUnavailableError();

    const existing = await tx.customer.findFirst({
      where: { id: customerId, storeId: context.storeId },
      select: { id: true, internalName: true, customerCode: true },
    });
    if (existing) {
      if (existing.internalName !== input.internalName) throw new ReceptionRequestConflictError();
      // A retry must not open another Visit, even if the original one was already checked out.
      return { ...existing, replayed: true };
    }

    await requireOpenBusinessDay(tx, context.storeId);
    const customers = await tx.customer.findMany({
      where: { storeId: context.storeId },
      select: { id: true, customerCode: true, internalName: true, isActive: true },
      orderBy: { customerCode: "asc" },
    });
    const candidates = customers.filter((customer) => receptionNameKey(customer.internalName) === receptionNameKey(input.internalName));
    if (candidates.length && !input.confirmDifferentPerson) throw new ReceptionNameExistsError(candidates);

    const customer = await tx.customer.create({
      data: {
        id: customerId, storeId: context.storeId,
        customerCode: nextReceptionCode(customers.map((row) => row.customerCode)),
        internalName: input.internalName,
      },
      select: { id: true, internalName: true, customerCode: true },
    });
    // No PublicProfile is created: public participation remains OFF.
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId,
      action: "CUSTOMER_CREATE", entityType: "Customer", entityId: customer.id,
      metadata: { source: "quick-reception", changedFields: ["customerCode", "internalName"], sameNameConfirmed: candidates.length > 0 },
    }, tx);
    await checkInVisitInTransaction(tx, customer.id, context);
    return { ...customer, replayed: false };
  }, { maxWait: 10_000, timeout: 15_000 });
}
