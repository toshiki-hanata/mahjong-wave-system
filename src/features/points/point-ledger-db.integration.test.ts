import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";
import { adjustPoints, reversePointAdjustment, getPointLedgerData, PointPermissionError, PointConflictError, PointCustomerUnavailableError, PointBalanceError } from "./point-ledger-service";

const enabled = process.env.RUN_POINT_LEDGER_DB_TESTS === "true", db = new PrismaClient(), rollback = new Error("ROLLBACK_POINT_LEDGER");
function adapter(tx: Prisma.TransactionClient) {
  let sequence = 0;
  return { $transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => {
    const key = `point_fixture_${++sequence}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${key}`);
    try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${key}`); return result; }
    catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${key}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${key}`); throw error; }
  } } as unknown as PrismaClient;
}
describe.skipIf(!enabled)("Point ledger rollback-only integration", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  afterAll(async () => { await db.$disconnect(); });
  it("enforces permissions, store FKs, append-only history, stale forms, replay and atomic audits", async () => {
    const storeId = `point-test-${randomUUID()}`, foreignId = `point-foreign-${randomUUID()}`;
    const countBefore = await db.pointLedgerEntry.count();
    await expect(db.$transaction(async (tx) => {
      await tx.store.createMany({ data: [{ id: storeId, name: "台帳検証", timezone: "Asia/Tokyo" }, { id: foreignId, name: "別店舗検証", timezone: "Asia/Tokyo" }] });
      const manager = await tx.staff.create({ data: { storeId, name: "検証責任者", role: "MANAGER", loginId: randomUUID(), passwordHash: "not-a-login" } });
      const employee = await tx.staff.create({ data: { storeId, name: "検証スタッフ", role: "STAFF", loginId: randomUUID(), passwordHash: "not-a-login" } });
      const foreign = await tx.staff.create({ data: { storeId: foreignId, name: "別店舗スタッフ", role: "OWNER", loginId: randomUUID(), passwordHash: "not-a-login" } });
      const customer = await tx.customer.create({ data: { storeId, internalName: "検証会員", customerCode: "W0001" } });
      const other = await tx.customer.create({ data: { storeId: foreignId, internalName: "別店舗会員", customerCode: "W0001" } });
      const service = adapter(tx), context = { storeId, staffId: manager.id };
      const input = { customerId: customer.id, requestKey: randomUUID(), expectedBalance: 0, delta: 10, reason: "検証用調整" };
      await expect(adjustPoints(service, input, { storeId, staffId: employee.id })).rejects.toBeInstanceOf(PointPermissionError);
      await expect(adjustPoints(service, input, { storeId, staffId: foreign.id })).rejects.toBeInstanceOf(PointPermissionError);
      await expect(adjustPoints(service, { ...input, customerId: other.id }, context)).rejects.toBeInstanceOf(PointCustomerUnavailableError);
      const first = await adjustPoints(service, input, context);
      expect(await adjustPoints(service, input, context)).toMatchObject({ replayed: true, balance: 10 });
      expect(await tx.pointLedgerEntry.count({ where: { storeId } })).toBe(1);
      await expect(adjustPoints(service, { ...input, requestKey: randomUUID() }, context)).rejects.toBeInstanceOf(PointConflictError);
      await expect(adjustPoints(service, { ...input, requestKey: randomUUID(), expectedBalance: 10, delta: -11 }, context)).rejects.toBeInstanceOf(PointBalanceError);
      const reverseInput = { customerId: customer.id, entryId: first.entryId, requestKey: randomUUID(), expectedBalance: 10, reason: "入力を取り消す" };
      await reversePointAdjustment(service, reverseInput, context);
      expect(await reversePointAdjustment(service, reverseInput, context)).toMatchObject({ replayed: true });
      await expect(reversePointAdjustment(service, { ...reverseInput, requestKey: randomUUID(), expectedBalance: 0 }, context)).rejects.toBeInstanceOf(PointConflictError);
      const self = await getPointLedgerData(service, { storeId, staffId: employee.id }, customer.id);
      expect(self).toMatchObject({ canAdjust: false, balance: 0, totalEntries: 2 });
      expect(self?.entries.map((entry) => entry.kind)).toEqual(["REVERSE", "ADJUST"]);
      expect(await getPointLedgerData(service, context, other.id)).toBeNull();
      await expect(service.$transaction((client) => client.pointLedgerEntry.update({ where: { id: first.entryId }, data: { delta: 20 } }))).rejects.toThrow();
      await expect(service.$transaction((client) => client.pointLedgerEntry.delete({ where: { id: first.entryId } }))).rejects.toThrow();
      await expect(service.$transaction((client) => client.pointLedgerEntry.create({ data: { storeId, customerId: other.id, actorStaffId: manager.id, kind: "ADJUST", delta: 1, balanceAfter: 1, sequenceNumber: 3, requestKey: randomUUID(), reason: "不正な店舗" } }))).rejects.toMatchObject({ code: "P2003" });
      const audits = await tx.auditLog.count({ where: { storeId, action: { in: ["POINT_ADJUSTMENT", "POINT_REVERSAL"] } } });
      expect(audits).toBe(2);
      const failure = new Error("point transaction failed");
      const failing = { $transaction: async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => service.$transaction(async (client) => { await fn(client); throw failure; }) } as unknown as PrismaClient;
      await expect(adjustPoints(failing, { ...input, requestKey: randomUUID() }, context)).rejects.toBe(failure);
      expect(await tx.pointLedgerEntry.count({ where: { storeId } })).toBe(2);
      expect(await tx.auditLog.count({ where: { storeId } })).toBe(audits);
      throw rollback;
    }, { maxWait: 10_000, timeout: 180_000 })).rejects.toBe(rollback);
    expect(await db.store.count({ where: { id: { in: [storeId, foreignId] } } })).toBe(0);
    expect(await db.pointLedgerEntry.count()).toBe(countBefore);
  }, 210_000);
});
