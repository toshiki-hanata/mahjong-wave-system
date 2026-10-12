import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, VisitStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { checkInVisit, checkOutVisit, DuplicateOpenVisitError, InvalidVisitTransitionError, transitionVisitForTable, VisitCustomerUnavailableError } from "./visit-service";
import { recordAuditLog } from "@/lib/audit-log";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";

const enabled = process.env.RUN_VISIT_DB_TESTS === "true" && Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
const describeDatabase = describe.skipIf(!enabled);
const database = new PrismaClient();
let storeId = "";
let staffId = "";
let customerId = "";
let currentOpenVisitId: string | null = null;

describeDatabase("Visit integration against the development database", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(database); });
  beforeAll(async () => {
    const owner = await database.staff.findFirst({
      where: { role: Role.OWNER, isActive: true, store: { is: { isActive: true } } },
      select: { id: true, storeId: true },
    });
    if (!owner) throw new Error("An active development OWNER is required for Visit integration tests.");
    storeId = owner.storeId;
    staffId = owner.id;
    const customer = await database.customer.create({
      data: { storeId, customerCode: `VTEST-${randomUUID()}`, internalName: "TEST VISIT CUSTOMER", note: "Integration fixture; retain inactive." },
      select: { id: true },
    });
    customerId = customer.id;
  }, 30_000);

  it("checks in, updates visit dates, rejects duplicates, and preserves a new same-day Visit after checkout", async () => {
    const firstId = await checkInVisit(database, customerId, { storeId, staffId });
    currentOpenVisitId = firstId;
    const first = await database.visit.findUniqueOrThrow({ where: { id: firstId } });
    const customerAfterFirst = await database.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(first.status).toBe(VisitStatus.WAITING);
    expect(first.checkedOutAt).toBeNull();
    expect(first.checkedInAt.toISOString()).toBe(customerAfterFirst.firstVisitAt?.toISOString());
    expect(first.checkedInAt.toISOString()).toBe(customerAfterFirst.lastVisitAt?.toISOString());
    await expect(checkInVisit(database, customerId, { storeId, staffId })).rejects.toBeInstanceOf(DuplicateOpenVisitError);

    await transitionVisitForTable(database, firstId, { storeId, staffId }, VisitStatus.PLAYING);
    await expect(checkOutVisit(database, firstId, { storeId, staffId })).rejects.toBeInstanceOf(InvalidVisitTransitionError);
    await transitionVisitForTable(database, firstId, { storeId, staffId }, VisitStatus.WAITING);
    await expect(checkOutVisit(database, firstId, { storeId: `other-${randomUUID()}`, staffId })).resolves.toBe(false);
    await expect(checkOutVisit(database, firstId, { storeId, staffId })).resolves.toBe(true);
    currentOpenVisitId = null;
    await expect(checkOutVisit(database, firstId, { storeId, staffId })).rejects.toBeInstanceOf(InvalidVisitTransitionError);

    const secondId = await checkInVisit(database, customerId, { storeId, staffId });
    currentOpenVisitId = secondId;
    expect(secondId).not.toBe(firstId);
    const afterSecond = await database.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(afterSecond.firstVisitAt?.toISOString()).toBe(first.checkedInAt.toISOString());
    expect(afterSecond.lastVisitAt?.getTime()).toBeGreaterThanOrEqual(first.checkedInAt.getTime());
    await checkOutVisit(database, secondId, { storeId, staffId });
    currentOpenVisitId = null;
  }, 60_000);

  it("rejects inactive and other-store Customers without writing a Visit", async () => {
    const before = await database.visit.count({ where: { storeId, customerId } });
    await expect(checkInVisit(database, `missing-${randomUUID()}`, { storeId, staffId })).rejects.toBeInstanceOf(VisitCustomerUnavailableError);
    await expect(checkInVisit(database, customerId, { storeId: `other-${randomUUID()}`, staffId })).rejects.toBeInstanceOf(VisitCustomerUnavailableError);
    await database.customer.update({ where: { id: customerId }, data: { isActive: false } });
    await expect(checkInVisit(database, customerId, { storeId, staffId })).rejects.toBeInstanceOf(VisitCustomerUnavailableError);
    expect(await database.visit.count({ where: { storeId, customerId } })).toBe(before);
  }, 30_000);

  it("prevents concurrent duplicates at the PostgreSQL partial unique index", async () => {
    // Deliberately bypass the service's row lock/pre-check: the database index itself must reject one writer.
    const outcomes = await Promise.allSettled([1, 2].map(() => database.$transaction(async (tx) => {
      const checkedInAt = new Date();
      const visit = await tx.visit.create({ data: { storeId, customerId, checkedInAt, status: VisitStatus.WAITING } });
      await recordAuditLog({ storeId, actorStaffId: staffId, action: "VISIT_CHECK_IN", entityType: "Visit", entityId: visit.id, metadata: { testFixture: true } }, tx);
      return visit.id;
    })));
    const successes = outcomes.filter((item): item is PromiseFulfilledResult<string> => item.status === "fulfilled");
    const failures = outcomes.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ code: "P2002" });
    currentOpenVisitId = successes[0].value;
    expect(await database.visit.count({ where: { storeId, customerId, status: { in: [VisitStatus.WAITING, VisitStatus.PLAYING] } } })).toBe(1);
    await checkOutVisit(database, currentOpenVisitId, { storeId, staffId });
    currentOpenVisitId = null;
  }, 30_000);

  it("rolls back Visit and Customer timestamps when the audit write fails", async () => {
    await database.customer.update({ where: { id: customerId }, data: { isActive: true, firstVisitAt: null, lastVisitAt: null } });
    const before = await database.visit.count({ where: { storeId, customerId } });
    await expect(checkInVisit(database, customerId, { storeId, staffId: `missing-staff-${randomUUID()}` })).rejects.toBeDefined();
    const after = await database.visit.count({ where: { storeId, customerId } });
    const customer = await database.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(after).toBe(before);
    expect(customer.firstVisitAt).toBeNull();
    expect(customer.lastVisitAt).toBeNull();
  }, 30_000);

  it("records check-in and check-out audit entries for retained Visit history", async () => {
    const visitCount = await database.visit.count({ where: { storeId, customerId } });
    expect(visitCount).toBeGreaterThanOrEqual(3);
    const auditCount = await database.auditLog.count({ where: { storeId, entityType: "Visit", action: { in: ["VISIT_CHECK_IN", "VISIT_CHECK_OUT"] } } });
    expect(auditCount).toBeGreaterThanOrEqual(visitCount);
  }, 30_000);

  afterAll(async () => {
    if (currentOpenVisitId && storeId && staffId) {
      const visit = await database.visit.findFirst({ where: { id: currentOpenVisitId, storeId }, select: { status: true } });
      if (visit?.status === VisitStatus.PLAYING) await transitionVisitForTable(database, currentOpenVisitId, { storeId, staffId }, VisitStatus.WAITING);
      if (visit && (visit.status === VisitStatus.WAITING || visit.status === VisitStatus.PLAYING)) {
        await checkOutVisit(database, currentOpenVisitId, { storeId, staffId });
      }
    }
    if (customerId) await database.customer.update({ where: { id: customerId }, data: { isActive: false } });
    await database.$disconnect();
  }, 30_000);
});
