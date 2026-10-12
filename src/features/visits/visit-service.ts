import "server-only";

import { Prisma, VisitStatus, type PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";

type TransactionDatabase = Pick<PrismaClient, "$transaction">;
type VisitContext = { storeId: string; staffId: string };

export class VisitCustomerUnavailableError extends Error {
  constructor() { super("Customer is unavailable."); this.name = "VisitCustomerUnavailableError"; }
}

export class DuplicateOpenVisitError extends Error {
  constructor() { super("Customer already has an open visit."); this.name = "DuplicateOpenVisitError"; }
}

export class VisitNotFoundError extends Error {
  constructor() { super("Visit was not found."); this.name = "VisitNotFoundError"; }
}

export class InvalidVisitTransitionError extends Error {
  constructor() { super("Visit cannot move to the requested state."); this.name = "InvalidVisitTransitionError"; }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockCustomer(
  tx: Prisma.TransactionClient,
  customerId: string,
  storeId: string,
  requireActive: boolean,
) {
  const activeClause = requireActive ? Prisma.sql`AND "isActive" = true` : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ id: string; firstVisitAt: Date | null; lastVisitAt: Date | null }>>`
    SELECT "id", "firstVisitAt", "lastVisitAt"
    FROM "Customer"
    WHERE "id" = ${customerId} AND "storeId" = ${storeId} ${activeClause}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

type LockedVisit = { id: string; status: VisitStatus; customerIsActive: boolean };

async function lockVisitRows(
  tx: Prisma.TransactionClient,
  visitIds: string[],
  storeId: string,
): Promise<LockedVisit[]> {
  return tx.$queryRaw<LockedVisit[]>`
    SELECT v."id", v."status", c."isActive" AS "customerIsActive"
    FROM "Visit" v
    JOIN "Customer" c ON c."id" = v."customerId" AND c."storeId" = v."storeId"
    WHERE v."id" IN (${Prisma.join(visitIds)}) AND v."storeId" = ${storeId}
    ORDER BY v."id"
    FOR UPDATE OF v, c
  `;
}

/** Transaction-scoped bulk transition used by table start/end. It deliberately does not write per-Visit audits. */
export async function transitionVisitsForTableInTransaction(
  tx: Prisma.TransactionClient,
  visitIds: string[],
  context: VisitContext,
  from: "WAITING" | "PLAYING",
  to: "WAITING" | "PLAYING",
): Promise<void> {
  await lockAndValidateVisitsForTableInTransaction(tx, visitIds, context, from, to === "PLAYING");
  const updated = await tx.visit.updateMany({
    where: { id: { in: visitIds }, storeId: context.storeId, status: from },
    data: { status: to },
  });
  if (updated.count !== 4) throw new InvalidVisitTransitionError();
}

/** Lock Visits and Customers before creating TableSeat rows, avoiding FK/row-lock deadlocks between tables. */
export async function lockAndValidateVisitsForTableInTransaction(
  tx: Prisma.TransactionClient,
  visitIds: string[],
  context: VisitContext,
  expected: "WAITING" | "PLAYING",
  requireActiveCustomer: boolean,
): Promise<void> {
  if (visitIds.length !== 4 || new Set(visitIds).size !== 4) {
    throw new InvalidVisitTransitionError();
  }
  const rows = await lockVisitRows(tx, visitIds, context.storeId);
  if (rows.length !== 4) {
    throw new InvalidVisitTransitionError();
  }
  if (requireActiveCustomer && rows.some((row) => !row.customerIsActive)) {
    throw new VisitCustomerUnavailableError();
  }
  if (rows.some((row) => row.status !== expected)) throw new InvalidVisitTransitionError();
}

async function transitionSingleVisitInTransaction(
  tx: Prisma.TransactionClient,
  visitId: string,
  context: VisitContext,
  target: "WAITING" | "PLAYING",
): Promise<{ from: VisitStatus; customerId: string } | null> {
  const currentVisit = await tx.visit.findFirst({
    where: { id: visitId, storeId: context.storeId },
    select: { customerId: true, status: true },
  });
  if (!currentVisit) return null;
  const customer = await lockCustomer(tx, currentVisit.customerId, context.storeId, target === "PLAYING");
  if (!customer && target === "PLAYING") throw new VisitCustomerUnavailableError();
  if (currentVisit.status !== (target === "PLAYING" ? VisitStatus.WAITING : VisitStatus.PLAYING)) {
    throw new InvalidVisitTransitionError();
  }
  const from = currentVisit.status;
  const updated = await tx.visit.updateMany({
    where: { id: visitId, storeId: context.storeId, status: from },
    data: { status: target },
  });
  if (updated.count !== 1) throw new InvalidVisitTransitionError();
  return { from, customerId: currentVisit.customerId };
}

export async function checkInVisit(
  database: TransactionDatabase,
  customerId: string,
  context: VisitContext,
): Promise<string> {
  try {
    return await database.$transaction(async (tx) => {
      const customer = await lockCustomer(tx, customerId, context.storeId, true);
      if (!customer) throw new VisitCustomerUnavailableError();

      const openVisit = await tx.visit.findFirst({
        where: {
          storeId: context.storeId,
          customerId,
          status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] },
        },
        select: { id: true },
      });
      if (openVisit) throw new DuplicateOpenVisitError();

      const checkedInAt = new Date();
      const visit = await tx.visit.create({
        data: {
          storeId: context.storeId,
          customerId,
          checkedInAt,
          status: VisitStatus.WAITING,
        },
        select: { id: true },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          firstVisitAt: customer.firstVisitAt && customer.firstVisitAt < checkedInAt
            ? customer.firstVisitAt
            : checkedInAt,
          lastVisitAt: customer.lastVisitAt && customer.lastVisitAt > checkedInAt
            ? customer.lastVisitAt
            : checkedInAt,
        },
      });

      await recordAuditLog({
        storeId: context.storeId,
        actorStaffId: context.staffId,
        action: "VISIT_CHECK_IN",
        entityType: "Visit",
        entityId: visit.id,
        metadata: { customerId, status: VisitStatus.WAITING, checkedInAt: checkedInAt.toISOString() },
      }, tx);

      return visit.id;
    });
  } catch (error) {
    // The partial unique index is the final concurrency guard; this pre-check is only for UX.
    if (isUniqueViolation(error)) throw new DuplicateOpenVisitError();
    throw error;
  }
}

export async function checkOutVisit(
  database: TransactionDatabase,
  visitId: string,
  context: VisitContext,
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const initial = await tx.visit.findFirst({
      where: { id: visitId, storeId: context.storeId },
      select: { customerId: true },
    });
    if (!initial) return false;

    const customer = await lockCustomer(tx, initial.customerId, context.storeId, false);
    if (!customer) return false;

    const current = await tx.visit.findFirst({
      where: { id: visitId, storeId: context.storeId },
      select: { id: true, customerId: true, status: true },
    });
    if (!current) return false;
    if (current.status === VisitStatus.PLAYING || current.status !== VisitStatus.WAITING) {
      throw new InvalidVisitTransitionError();
    }

    const checkedOutAt = new Date();
    const updated = await tx.visit.updateMany({
      where: { id: visitId, storeId: context.storeId, status: VisitStatus.WAITING },
      data: { status: VisitStatus.CHECKED_OUT, checkedOutAt },
    });
    if (updated.count !== 1) throw new InvalidVisitTransitionError();

    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.staffId,
      action: "VISIT_CHECK_OUT",
      entityType: "Visit",
      entityId: visitId,
      metadata: { customerId: current.customerId, fromStatus: VisitStatus.WAITING, toStatus: VisitStatus.CHECKED_OUT, checkedOutAt: checkedOutAt.toISOString() },
    }, tx);
    return true;
  });
}

/** Reserved for Sprint 3 table seating; no UI or Server Action exposes this in Sprint 2.5. */
export async function transitionVisitForTable(
  database: TransactionDatabase,
  visitId: string,
  context: VisitContext,
  target: "WAITING" | "PLAYING",
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const transitioned = await transitionSingleVisitInTransaction(tx, visitId, context, target);
    if (!transitioned) return false;
    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.staffId,
      action: "VISIT_STATUS_CHANGE",
      entityType: "Visit",
      entityId: visitId,
      metadata: { customerId: transitioned.customerId, fromStatus: transitioned.from, toStatus: target },
    }, tx);
    return true;
  });
}
