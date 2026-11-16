import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertConfiguredDatabaseTest } from "./assert-db-test-config";
import { reserveStaffAction, StaffActionIdentityError } from "@/lib/auth/staff-action-quota";
import { revokeLogoutSession } from "@/lib/auth/logout-service";
const enabled = process.env.RUN_SECURITY_DB_TESTS === "true", db = new PrismaClient(), rollback = new Error("SECURITY_FIXTURE_ROLLBACK");
function adapter(tx: Prisma.TransactionClient) { return { $transaction: async <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => fn(tx) } as unknown as PrismaClient; }
describe.skipIf(!enabled)("security controls in a marked non-production database", () => {
  beforeAll(async () => { await assertConfiguredDatabaseTest(db); });
  afterAll(async () => { await db.$disconnect(); });
  it("invalidates the old cookie version, rejects replay and audits atomically in a rollback-only fixture", async () => {
    const storeId = "security-rollback-" + randomUUID();
    await expect(db.$transaction(async tx => {
      await tx.store.create({ data: { id: storeId, name: "セキュリティ検証専用", timezone: "Asia/Tokyo" } });
      const staff = await tx.staff.create({ data: { storeId, role: "STAFF", name: "検証担当", loginId: randomUUID(), passwordHash: "not-a-login-account" } });
      const actor = { id: staff.id, storeId, role: "STAFF", sessionVersion: 0 }, service = adapter(tx);
      expect(await reserveStaffAction(service, actor, 3)).toBe(true);
      expect(await revokeLogoutSession(service, { staffId: staff.id, storeId, sessionVersion: 0 })).toBe(true);
      await expect(reserveStaffAction(service, actor)).rejects.toBeInstanceOf(StaffActionIdentityError);
      expect(await revokeLogoutSession(service, { staffId: staff.id, storeId, sessionVersion: 0 })).toBe(false);
      expect((await tx.staff.findUniqueOrThrow({ where: { id: staff.id } })).sessionVersion).toBe(1);
      expect(await tx.auditLog.count({ where: { storeId, action: "STAFF_LOGOUT_ALL" } })).toBe(1);
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
    expect(await db.store.findUnique({ where: { id: storeId } })).toBeNull();
  }, 45000);
  it("enforces one shared quota across concurrent transactions and cleans only its own newly created fixture", async () => {
    const storeId = "security-rate-" + randomUUID(); let created = false;
    try {
      const staff = await db.$transaction(async tx => {
        await tx.store.create({ data: { id: storeId, name: "並行制限検証専用", timezone: "Asia/Tokyo" } });
        return tx.staff.create({ data: { storeId, role: "STAFF", name: "並行検証担当", loginId: randomUUID(), passwordHash: "not-a-login-account" } });
      }); created = true;
      const settled = await Promise.allSettled(Array.from({ length: 10 }, () => reserveStaffAction(db, { id: staff.id, storeId, role: "STAFF", sessionVersion: 0 }, 3)));
      expect(settled.every(x => x.status === "fulfilled")).toBe(true);
      expect(settled.filter(x => x.status === "fulfilled" && x.value)).toHaveLength(3);
      expect(await db.auditLog.count({ where: { storeId, action: "SECURITY_ACTION_ATTEMPT" } })).toBe(3);
    } finally {
      if (created) {
        if (!/^security-rate-[0-9a-f-]{36}$/.test(storeId)) throw new Error("Unsafe fixture cleanup target");
        await db.$transaction(async tx => { await tx.auditLog.deleteMany({ where: { storeId } }); await tx.staff.deleteMany({ where: { storeId } }); await tx.store.delete({ where: { id: storeId } }); });
      }
    }
  }, 60000);
});
