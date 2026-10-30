import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { recordAuditLog } from "@/lib/audit-log";

const MAX_BALANCE = 2_147_483_647;
const baseSchema = z.object({
  customerId: z.string().min(1).max(200), requestKey: z.uuid().transform((key) => key.toLowerCase()),
  expectedBalance: z.number().int().min(0).max(MAX_BALANCE), reason: z.string().trim().min(1).max(500),
});
export const pointAdjustmentSchema = baseSchema.extend({ delta: z.number().int().min(-MAX_BALANCE).max(MAX_BALANCE).refine((value) => value !== 0) });
export const pointReversalSchema = baseSchema.extend({ entryId: z.string().min(1).max(200) });
export type PointAdjustmentInput = z.infer<typeof pointAdjustmentSchema>;
export type PointReversalInput = z.infer<typeof pointReversalSchema>;
type Database = Pick<PrismaClient, "$transaction">;
type Context = { storeId: string; staffId: string };
export class PointPermissionError extends Error {}
export class PointCustomerUnavailableError extends Error {}
export class PointConflictError extends Error {}
export class PointBalanceError extends Error {}

async function authorize(tx: Prisma.TransactionClient, context: Context, writing: boolean) {
  const actor = await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true, store: { isActive: true } }, select: { role: true } });
  if (!actor || (writing && actor.role !== "OWNER" && actor.role !== "MANAGER")) throw new PointPermissionError();
  return actor.role === "OWNER" || actor.role === "MANAGER";
}
async function lockCustomer(tx: Prisma.TransactionClient, context: Context, customerId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "storeId" = ${context.storeId}
    AND "isActive" = true AND "participantStaffId" IS NULL FOR UPDATE
  `;
  if (rows.length !== 1) throw new PointCustomerUnavailableError();
}
async function balance(tx: Prisma.TransactionClient, storeId: string, customerId: string) {
  const result = await tx.pointLedgerEntry.aggregate({ where: { storeId, customerId }, _sum: { delta: true }, _count: { _all: true } });
  const value = result._sum.delta ?? 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BALANCE) throw new PointBalanceError();
  return { value, count: result._count._all };
}

async function writeEntry(database: Database, raw: PointAdjustmentInput | PointReversalInput, context: Context, kind: "ADJUST" | "REVERSE") {
  const input = kind === "ADJUST" ? pointAdjustmentSchema.parse(raw) : pointReversalSchema.parse(raw);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    await authorize(tx, context, true);
    const replay = await tx.pointLedgerEntry.findFirst({ where: { storeId: context.storeId, requestKey: input.requestKey } });
    if (replay) {
      const matches = replay.kind === kind && replay.customerId === input.customerId && replay.actorStaffId === context.staffId && replay.reason === input.reason
        && replay.balanceAfter - replay.delta === input.expectedBalance
        && ("delta" in input ? replay.delta === input.delta : replay.reversesEntryId === input.entryId);
      if (!matches) throw new PointConflictError();
      return { entryId: replay.id, balance: replay.balanceAfter, replayed: true };
    }
    await lockCustomer(tx, context, input.customerId);
    const current = await balance(tx, context.storeId, input.customerId);
    if (current.value !== input.expectedBalance) throw new PointConflictError();
    let delta: number, reversesEntryId: string | null = null;
    if ("delta" in input) delta = input.delta;
    else {
      const original = await tx.pointLedgerEntry.findFirst({ where: { id: input.entryId, storeId: context.storeId, customerId: input.customerId, kind: "ADJUST" }, select: { id: true, delta: true, reversalEntries: { select: { id: true } } } });
      if (!original || original.reversalEntries.length) throw new PointConflictError();
      delta = -original.delta; reversesEntryId = original.id;
    }
    const after = current.value + delta;
    if (!Number.isSafeInteger(after) || after < 0 || after > MAX_BALANCE) throw new PointBalanceError();
    const entry = await tx.pointLedgerEntry.create({ data: {
      storeId: context.storeId, customerId: input.customerId, actorStaffId: context.staffId,
      kind, delta, balanceAfter: after, sequenceNumber: current.count + 1, requestKey: input.requestKey, reason: input.reason, reversesEntryId,
    }, select: { id: true } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: kind === "ADJUST" ? "POINT_ADJUSTMENT" : "POINT_REVERSAL", entityType: "PointLedgerEntry", entityId: entry.id,
      metadata: { customerId: input.customerId, delta, balanceBefore: current.value, balanceAfter: after, reason: input.reason, requestKey: input.requestKey, reversesEntryId } }, tx);
    return { entryId: entry.id, balance: after, replayed: false };
  }, { maxWait: 10_000, timeout: 30_000 });
}
export async function adjustPoints(database: Database, input: PointAdjustmentInput, context: Context) { return writeEntry(database, input, context, "ADJUST"); }
export async function reversePointAdjustment(database: Database, input: PointReversalInput, context: Context) { return writeEntry(database, input, context, "REVERSE"); }

export async function getPointLedgerData(database: PrismaClient, context: Context, customerId: string) {
  return database.$transaction(async (tx) => {
    const canAdjust = await authorize(tx, context, false);
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId: context.storeId, participantStaffId: null }, select: { id: true, internalName: true, customerCode: true, isActive: true } });
    if (!customer) return null;
    const current = await balance(tx, context.storeId, customerId);
    const entries = await tx.pointLedgerEntry.findMany({ where: { storeId: context.storeId, customerId }, orderBy: { sequenceNumber: "desc" }, take: 50,
      select: { id: true, kind: true, delta: true, balanceAfter: true, sequenceNumber: true, reason: true, createdAt: true, reversesEntryId: true, actor: { select: { name: true } }, reversalEntries: { select: { id: true } } } });
    return { customer, canAdjust, balance: current.value, totalEntries: current.count, entries };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}
