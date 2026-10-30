import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";
import { issueCustomerPairing, claimCustomerPairing, confirmCustomerPairing, confirmStaffPairing, cancelCustomerPairing, readClaimedPairing, CustomerLinkError } from "./pairing-service";
import { createAuthToken, hashAuthToken } from "./auth-tokens";
const enabled = process.env.RUN_CUSTOMER_PAIRING_DB_TESTS === "true", db = new PrismaClient(), rollback = new Error("ROLLBACK_PAIRING");
function adapter(tx: Prisma.TransactionClient) {
  let sequence = 0;
  return { $transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => {
    const key = `pairing_fixture_${++sequence}`; await tx.$executeRawUnsafe(`SAVEPOINT ${key}`);
    try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${key}`); return result; }
    catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${key}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${key}`); throw error; }
  } } as unknown as PrismaClient;
}
describe.skipIf(!enabled)("Customer pairing rollback-only integration", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); }); afterAll(async () => { await db.$disconnect(); });
  it("binds claims and confirmations, blocks replacement and preserves attendance/points", async () => {
    const storeId = `pair-test-${randomUUID()}`, foreignId = `pair-other-${randomUUID()}`;
    const before = { identity: await db.customerAuthIdentity.count(), pairings: await db.customerPairing.count(), visits: await db.visit.count(), points: await db.pointLedgerEntry.count() };
    await expect(db.$transaction(async (tx) => {
      await tx.store.createMany({ data: [{ id: storeId, name: "連携検証", timezone: "Asia/Tokyo" }, { id: foreignId, name: "別店舗検証", timezone: "Asia/Tokyo" }] });
      const actor = await tx.staff.create({ data: { storeId, name: "検証スタッフ", role: "STAFF", loginId: randomUUID(), passwordHash: "not-a-login" } });
      const foreign = await tx.staff.create({ data: { storeId: foreignId, name: "別店舗スタッフ", role: "OWNER", loginId: randomUUID(), passwordHash: "not-a-login" } });
      const customer = await tx.customer.create({ data: { storeId, customerCode: "W0001", internalName: "検証会員" } });
      const otherCustomer = await tx.customer.create({ data: { storeId: foreignId, customerCode: "W0001", internalName: "同じ名前の別会員" } });
      const service = adapter(tx), context = { storeId, staffId: actor.id }, input = { customerId: customer.id, requestKey: randomUUID() };
      await expect(issueCustomerPairing(service, { ...input, customerId: otherCustomer.id }, context)).rejects.toBeInstanceOf(CustomerLinkError);
      await expect(issueCustomerPairing(service, input, { storeId, staffId: foreign.id })).rejects.toBeInstanceOf(CustomerLinkError);
      const first = await issueCustomerPairing(service, input, context), claim = createAuthToken();
      expect((await issueCustomerPairing(service, input, context)).token).toBeNull();
      expect((await tx.customerPairing.findUniqueOrThrow({ where: { id: first.pairingId } })).tokenHash).toBe(hashAuthToken(first.token!));
      expect((await claimCustomerPairing(service, first.token, claim)).state).toBe("CONFIRM");
      expect((await claimCustomerPairing(service, first.token, createAuthToken())).state).toBe("INVALID");
      await expect(confirmStaffPairing(service, first.pairingId, otherCustomer.id, context)).rejects.toBeInstanceOf(CustomerLinkError);
      expect((await confirmCustomerPairing(service, claim)).state).toBe("CONFIRM");
      await confirmStaffPairing(service, first.pairingId, customer.id, context);
      const ready = await readClaimedPairing(service, claim); expect(ready.state).toBe("READY");
      expect(ready).not.toHaveProperty("customerId"); expect(ready).not.toHaveProperty("storeId"); expect(ready).not.toHaveProperty("claimHash");
      expect((await tx.customerAuthIdentity.findFirstOrThrow({ where: { storeId, customerId: customer.id } })).activatedAt).toBeNull();
      expect((await tx.customerPairing.findUniqueOrThrow({ where: { id: first.pairingId } })).completedAt).toBeNull();
      const second = await issueCustomerPairing(service, { ...input, requestKey: randomUUID() }, context);
      expect((await readClaimedPairing(service, claim)).state).toBe("INVALID");
      await claimCustomerPairing(service, second.token, createAuthToken()); await cancelCustomerPairing(service, second.pairingId, customer.id, context);
      expect((await claimCustomerPairing(service, second.token, createAuthToken())).state).toBe("INVALID");
      const third = await issueCustomerPairing(service, { ...input, requestKey: randomUUID() }, context);
      await tx.customerPairing.update({ where: { id: third.pairingId }, data: { expiresAt: new Date(Date.now() - 1), createdAt: new Date(Date.now() - 1000) } });
      expect((await claimCustomerPairing(service, third.token, createAuthToken())).state).toBe("INVALID");
      await tx.customerAuthIdentity.update({ where: { storeId_customerId: { storeId, customerId: customer.id } }, data: { activatedAt: new Date() } });
      await expect(issueCustomerPairing(service, { ...input, requestKey: randomUUID() }, context)).rejects.toBeInstanceOf(CustomerLinkError);
      expect(await tx.visit.count({ where: { storeId } })).toBe(0); expect(await tx.pointLedgerEntry.count({ where: { storeId } })).toBe(0);
      const logs = await tx.auditLog.findMany({ where: { storeId }, select: { metadata: true } });
      expect(JSON.stringify(logs)).not.toContain(first.token!); expect(JSON.stringify(logs)).not.toContain(claim);
      throw rollback;
    }, { maxWait: 10_000, timeout: 180_000 })).rejects.toBe(rollback);
    expect(await db.store.count({ where: { id: { in: [storeId, foreignId] } } })).toBe(0);
    expect({ identity: await db.customerAuthIdentity.count(), pairings: await db.customerPairing.count(), visits: await db.visit.count(), points: await db.pointLedgerEntry.count() }).toEqual(before);
  }, 210_000);
});
