import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { reserveStaffAction, StaffActionIdentityError } from "./staff-action-quota";
const actor = { id: "fixture-staff", storeId: "fixture-store", role: "STAFF", sessionVersion: 2 };
function fixture() {
  const state = { clock: new Date("2026-11-16T00:00:00Z"), version: 2, audits: [] as Array<{ createdAt: Date }>, failAudit: false };
  let queue = Promise.resolve();
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => sql.join().includes("CURRENT_TIMESTAMP") ? [{ now: state.clock }] : [{ id: actor.storeId, timezone: "Asia/Tokyo", freeGamePriceYen: 2500 }],
    staff: { findFirst: async () => ({ role: "STAFF", sessionVersion: state.version }) },
    auditLog: {
      count: async ({ where }: { where: { createdAt: { gte: Date } } }) => state.audits.filter(x => x.createdAt >= where.createdAt.gte).length,
      create: async () => { if (state.failAudit) throw new Error("fixture audit failure"); state.audits.push({ createdAt: state.clock }); },
    },
  };
  const database = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
    const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
    const before = structuredClone(state); try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; } finally { release(); }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, database };
}
describe("shared staff-action quota", () => {
  it("serializes concurrent attempts and admits no more than the policy", async () => {
    const { database, state } = fixture();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveStaffAction(database, actor, 3)));
    expect(results.filter(Boolean)).toHaveLength(3); expect(state.audits).toHaveLength(3);
    state.clock = new Date(state.clock.getTime() + 60001);
    expect(await reserveStaffAction(database, actor, 3)).toBe(true);
  });
  it("rejects a revoked session and refuses a quota-record failure before business changes", async () => {
    const { database, state } = fixture(); state.version = 3;
    await expect(reserveStaffAction(database, actor)).rejects.toBeInstanceOf(StaffActionIdentityError); expect(state.audits).toHaveLength(0);
    state.version = 2; state.failAudit = true;
    await expect(reserveStaffAction(database, actor)).rejects.toThrow(); expect(state.audits).toHaveLength(0);
  });
});
