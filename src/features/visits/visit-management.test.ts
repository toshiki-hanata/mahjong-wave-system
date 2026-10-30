import { describe, expect, it, vi } from "vitest";
import { Prisma, Role, VisitStatus, type PrismaClient } from "@prisma/client";
import { checkInVisit, checkOutVisit, DuplicateOpenVisitError, InvalidVisitTransitionError } from "./visit-service";
import { getVisitStatusCounts, formatVisitDateTime } from "./visit-queries";
import { checkInVisitSchema } from "./visit-schemas";
import { futureVisitCorrectionRoles, visitOperationRoles } from "./visit-permissions";

function memoryDb(options: { openVisit?: { id: string } | null; currentVisit?: { id: string; customerId: string; status: VisitStatus } | null } = {}) {
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: "customer-1", firstVisitAt: null, lastVisitAt: null }]),
    businessDay: { findFirst: vi.fn(async () => ({ id: "business-1", closedAt: null })) },
    customer: { update: vi.fn(async () => ({})) },
    visit: {
      findFirst: vi.fn(async () => options.currentVisit ?? options.openVisit ?? null),
      create: vi.fn(async () => ({ id: "visit-1" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const database = { $transaction: (callback: (transaction: unknown) => unknown) => callback(tx) };
  return { database: database as unknown as Pick<PrismaClient, "$transaction">, tx };
}

describe("Visit management", () => {
  it("validates a customer ID for check-in", () => {
    expect(checkInVisitSchema.safeParse({ customerId: "customer-1" }).success).toBe(true);
    expect(checkInVisitSchema.safeParse({ customerId: "" }).success).toBe(false);
  });

  it("locks and scopes the customer, creates WAITING, updates visit dates, and audits atomically", async () => {
    const memory = memoryDb();
    const id = await checkInVisit(memory.database, "customer-1", { storeId: "store-1", staffId: "staff-1" });
    expect(id).toBe("visit-1");
    expect(memory.tx.$queryRaw).toHaveBeenCalled();
    expect(memory.tx.visit.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", customerId: "customer-1", status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } },
    }));
    expect(memory.tx.visit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store-1", customerId: "customer-1", status: VisitStatus.WAITING }) }));
    expect(memory.tx.customer.update).toHaveBeenCalled();
    expect(memory.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "VISIT_CHECK_IN", storeId: "store-1", actorStaffId: "staff-1" }) }));
  });

  it("rejects an existing open visit and relies on the database unique index for races", async () => {
    const memory = memoryDb({ openVisit: { id: "existing-visit" } });
    await expect(checkInVisit(memory.database, "customer-1", { storeId: "store-1", staffId: "staff-1" })).rejects.toBeInstanceOf(DuplicateOpenVisitError);
    expect(memory.tx.visit.create).not.toHaveBeenCalled();

    const raced = memoryDb();
    raced.tx.visit.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
    await expect(checkInVisit(raced.database, "customer-1", { storeId: "store-1", staffId: "staff-1" })).rejects.toBeInstanceOf(DuplicateOpenVisitError);
  });

  it("checks out WAITING visits once, records audit, and blocks PLAYING or repeated checkout", async () => {
    const waiting = memoryDb({ currentVisit: { id: "visit-1", customerId: "customer-1", status: VisitStatus.WAITING } });
    await expect(checkOutVisit(waiting.database, "visit-1", { storeId: "store-1", staffId: "staff-1" })).resolves.toBe(true);
    expect(waiting.tx.visit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "visit-1", storeId: "store-1", status: VisitStatus.WAITING },
      data: expect.objectContaining({ status: VisitStatus.CHECKED_OUT, checkedOutAt: expect.any(Date) }),
    }));
    expect(waiting.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "VISIT_CHECK_OUT" }) }));

    const playing = memoryDb({ currentVisit: { id: "visit-1", customerId: "customer-1", status: VisitStatus.PLAYING } });
    await expect(checkOutVisit(playing.database, "visit-1", { storeId: "store-1", staffId: "staff-1" })).rejects.toBeInstanceOf(InvalidVisitTransitionError);
    const closed = memoryDb({ currentVisit: { id: "visit-1", customerId: "customer-1", status: VisitStatus.CHECKED_OUT } });
    await expect(checkOutVisit(closed.database, "visit-1", { storeId: "store-1", staffId: "staff-1" })).rejects.toBeInstanceOf(InvalidVisitTransitionError);
  });

  it("counts only open visits for the requested store", async () => {
    const groupBy = vi.fn(async () => [
      { status: VisitStatus.WAITING, _count: { _all: 2 } },
      { status: VisitStatus.PLAYING, _count: { _all: 1 } },
    ]);
    const database = { visit: { groupBy } } as unknown as Pick<PrismaClient, "visit">;
    await expect(getVisitStatusCounts(database, "store-1")).resolves.toEqual({ total: 3, waiting: 2, playing: 1 });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-1", status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } } }));
  });

  it("formats UTC instants in the Store timezone", () => {
    const rendered = formatVisitDateTime(new Date("2026-02-01T15:30:00.000Z"), "Asia/Tokyo");
    expect(rendered).toContain("2026/02/02");
    expect(rendered).toContain("00:30");
  });

  it("allows all current staff roles to operate visits and reserves corrections for OWNER/MANAGER", () => {
    expect(visitOperationRoles).toEqual([Role.OWNER, Role.MANAGER, Role.STAFF]);
    expect(futureVisitCorrectionRoles).toEqual([Role.OWNER, Role.MANAGER]);
  });
});
