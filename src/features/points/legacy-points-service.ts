import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { recordAuditLog } from "@/lib/audit-log";
import { PointPermissionError, PointConflictError, PointBalanceError, PointCustomerUnavailableError } from "./point-ledger-service";

const MAX = 2147483647;
export const legacyPointsSchema = z.object({ customerId: z.string().min(1).max(200), requestKey: z.uuid().transform(x => x.toLowerCase()), expectedBalance: z.number().int().min(0).max(MAX), expectedImported: z.number().int().min(0).max(MAX).nullable(), amount: z.number().int().min(0).max(MAX), source: z.enum(["VISUAL", "NO_CARD"]), reason: z.string().trim().min(1).max(500), personConfirmed: z.literal(true), rosterConfirmed: z.literal(true), cardConfirmed: z.literal(true), duplicateChecked: z.literal(true) }).refine(x => x.source !== "NO_CARD" || (x.amount === 0 && x.expectedImported === null));
export type LegacyPointsInput = z.infer<typeof legacyPointsSchema>;
type Context = { storeId: string; staffId: string };
export async function saveLegacyPoints(database: Pick<PrismaClient, "$transaction">, raw: LegacyPointsInput, context: Context) {
  const input = legacyPointsSchema.parse(raw);
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, context.storeId);
    const actor = await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true, store: { isActive: true } }, select: { role: true } });
    if (!actor || !["OWNER", "MANAGER"].includes(actor.role)) throw new PointPermissionError();
    const replay = await tx.legacyPointChange.findUnique({ where: { storeId_requestKey: { storeId: context.storeId, requestKey: input.requestKey } } });
    if (replay) {
      if (replay.customerId !== input.customerId || replay.actorStaffId !== context.staffId || replay.importedAmount !== input.amount || replay.expectedBalance !== input.expectedBalance || replay.previousAmount !== (input.expectedImported ?? 0) || replay.kind !== (input.expectedImported === null ? "INITIAL" : "CORRECT") || replay.source !== input.source || replay.reason !== input.reason) throw new PointConflictError();
      return { changeId: replay.id, replayed: true };
    }
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: context.storeId, isActive: true, participantStaffId: null }, select: { id: true } });
    if (!customer) throw new PointCustomerUnavailableError();
    const migration = await tx.legacyPointMigration.findUnique({ where: { storeId_customerId: { storeId: context.storeId, customerId: input.customerId } }, include: { changes: { orderBy: { revision: "desc" }, take: 1 } } });
    const imported = migration?.changes[0]?.importedAmount ?? null;
    if (imported !== input.expectedImported || (migration && imported === null)) throw new PointConflictError();
    const current = await tx.pointLedgerEntry.aggregate({ where: { storeId: context.storeId, customerId: input.customerId }, _sum: { delta: true }, _count: { _all: true } });
    const value = current._sum.delta ?? 0, delta = input.amount - (imported ?? 0), after = value + delta;
    if (value !== input.expectedBalance) throw new PointConflictError();
    if (!Number.isSafeInteger(after) || after < 0 || after > MAX) throw new PointBalanceError();
    const header = migration ?? await tx.legacyPointMigration.create({ data: { storeId: context.storeId, customerId: input.customerId } });
    let entryId: string | undefined;
    if (delta) { const entry = await tx.pointLedgerEntry.create({ data: { storeId: context.storeId, customerId: input.customerId, actorStaffId: context.staffId, kind: "ADJUST", delta, balanceAfter: after, sequenceNumber: current._count._all + 1, requestKey: input.requestKey, reason: input.reason } }); entryId = entry.id; }
    const change = await tx.legacyPointChange.create({ data: { storeId: context.storeId, customerId: input.customerId, migrationId: header.id, actorStaffId: context.staffId, requestKey: input.requestKey, kind: migration ? "CORRECT" : "INITIAL", source: input.source, previousAmount: imported ?? 0, importedAmount: input.amount, expectedBalance: value, revision: (migration?.changes[0]?.revision ?? 0) + 1, ledgerEntryId: entryId, reason: input.reason } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: migration ? "LEGACY_POINTS_CORRECTED" : "LEGACY_POINTS_IMPORTED", entityType: "LegacyPointChange", entityId: change.id, metadata: { customerId: input.customerId, previousAmount: imported, importedAmount: input.amount, delta, balanceBefore: value, balanceAfter: after, source: input.source, verification: "person-roster-card-duplicate-checked", crossCustomerDuplicateDetection: "manual" } }, tx);
    return { changeId: change.id, replayed: false };
  }, { maxWait: 10000, timeout: 30000 });
}
export async function readLegacyPoints(tx: Prisma.TransactionClient, storeId: string, customerId: string) {
  const migration = await tx.legacyPointMigration.findUnique({ where: { storeId_customerId: { storeId, customerId } }, include: { changes: { orderBy: { revision: "desc" }, take: 50, select: { id: true, kind: true, source: true, previousAmount: true, importedAmount: true, reason: true, createdAt: true, actor: { select: { name: true } } } } } });
  return migration ? { amount: migration.changes[0]?.importedAmount ?? 0, changes: migration.changes } : null;
}
