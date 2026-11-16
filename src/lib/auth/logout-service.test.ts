import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { revokeLogoutSession } from "./logout-service";

function fixture(failAudit = false) {
  const state = { version: 7, audits: [] as unknown[] };
  const tx = {
    $queryRaw: async () => [{ id: "fixture-store" }],
    staff: { updateMany: async ({ where }: { where: { id: string; storeId: string; sessionVersion: number } }) => {
      if (where.id !== "fixture-staff" || where.storeId !== "fixture-store" || where.sessionVersion !== state.version) return { count: 0 };
      state.version++; return { count: 1 };
    } },
    auditLog: { create: async (event: unknown) => { if (failAudit) throw new Error("fixture audit failure"); state.audits.push(event); } },
  };
  const database = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => { const before = structuredClone(state); try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; } } } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, database };
}
const cookie = { staffId: "fixture-staff", storeId: "fixture-store", sessionVersion: 7 };
describe("logout revokes replayed cookies", () => {
  it("invalidates the old version, records audit once and leaves later logins alone on replay", async () => {
    const { state, database } = fixture();
    expect(await revokeLogoutSession(database, cookie)).toBe(true);
    expect(state.version).toBe(8); expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ data: { action: "STAFF_LOGOUT_ALL" } });
    expect(await revokeLogoutSession(database, cookie)).toBe(false);
    expect(state.version).toBe(8); expect(state.audits).toHaveLength(1);
  });
  it("refuses another store and restores the version if audit persistence fails", async () => {
    const good = fixture(); expect(await revokeLogoutSession(good.database, { ...cookie, storeId: "other-store" })).toBe(false);
    const bad = fixture(true); await expect(revokeLogoutSession(bad.database, cookie)).rejects.toThrow(); expect(bad.state.version).toBe(7);
  });
});
