import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { adjustPoints, reversePointAdjustment, pointAdjustmentSchema, PointBalanceError, PointConflictError, PointCustomerUnavailableError, PointPermissionError } from "./point-ledger-service";

function fixture() {
  type Entry = { id: string; kind: string; customerId: string; actorStaffId: string; delta: number; balanceAfter: number; sequenceNumber: number; requestKey: string; reason: string; reversesEntryId: string | null };
  const state = { role: "MANAGER", active: true, customerActive: true, staffCustomer: false, entries: [] as Entry[], audits: [] as unknown[] };
  const tx = {
    $queryRaw: vi.fn(async (sql: TemplateStringsArray) => sql.join("").includes('FROM "Store"') ? [{ id: "store-a" }] : state.customerActive && !state.staffCustomer ? [{ id: "customer-a" }] : []),
    staff: { findFirst: vi.fn(async () => state.active ? { role: state.role } : null) },
    pointLedgerEntry: {
      findFirst: vi.fn(async ({ where }: { where: { requestKey?: string; id?: string; kind?: string; customerId?: string } }) => {
        const row = state.entries.find((entry) => where.requestKey ? entry.requestKey === where.requestKey : entry.id === where.id && entry.customerId === where.customerId && entry.kind === where.kind);
        return row ? { ...row, reversalEntries: state.entries.filter((entry) => entry.reversesEntryId === row.id) } : null;
      }),
      aggregate: vi.fn(async () => ({ _sum: { delta: state.entries.reduce((sum, entry) => sum + entry.delta, 0) }, _count: { _all: state.entries.length } })),
      create: vi.fn(async ({ data }: { data: Omit<Entry, "id"> }) => { const entry = { ...data, id: `entry-${state.entries.length + 1}` }; state.entries.push(entry); return entry; }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => { state.audits.push(data); }) },
  };
  const database = { $transaction: async <T>(fn: (client: unknown) => Promise<T>) => { const before = structuredClone(state); try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; } } } as unknown as Pick<PrismaClient, "$transaction">;
  const context = { storeId: "store-a", staffId: "manager-a" };
  const input = { customerId: "customer-a", requestKey: randomUUID(), delta: 10, expectedBalance: 0, reason: "確認済みの調整" };
  return { state, tx, database, context, input };
}
describe("Append-only point adjustments", () => {
  it("stores adjustment, balance snapshot, sequence and audit atomically", async () => {
    const f = fixture();
    expect(await adjustPoints(f.database, f.input, f.context)).toMatchObject({ balance: 10, replayed: false });
    expect(f.state.entries[0]).toMatchObject({ kind: "ADJUST", delta: 10, sequenceNumber: 1, balanceAfter: 10 });
    expect(f.state.audits).toHaveLength(1);
    expect(f.tx.$queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  });
  it("replays the same request without adding points, even if the UUID case changes", async () => {
    const f = fixture(); await adjustPoints(f.database, f.input, f.context);
    expect(await adjustPoints(f.database, { ...f.input, requestKey: f.input.requestKey.toUpperCase() }, f.context)).toMatchObject({ balance: 10, replayed: true });
    expect(f.state.entries).toHaveLength(1); expect(f.state.audits).toHaveLength(1);
  });
  it("rejects reusing a request for a different amount, target, reason or actor", async () => {
    const f = fixture(); await adjustPoints(f.database, f.input, f.context);
    for (const input of [{ ...f.input, delta: 20 }, { ...f.input, customerId: "other" }, { ...f.input, reason: "別の理由" }]) await expect(adjustPoints(f.database, input, f.context)).rejects.toBeInstanceOf(PointConflictError);
    await expect(adjustPoints(f.database, f.input, { ...f.context, staffId: "another-manager" })).rejects.toBeInstanceOf(PointConflictError);
  });
  it("rejects stale forms and insufficient balances without changing the ledger", async () => {
    const f = fixture(); await adjustPoints(f.database, f.input, f.context);
    await expect(adjustPoints(f.database, { ...f.input, requestKey: randomUUID(), delta: 1 }, f.context)).rejects.toBeInstanceOf(PointConflictError);
    await expect(adjustPoints(f.database, { ...f.input, requestKey: randomUUID(), delta: -11, expectedBalance: 10 }, f.context)).rejects.toBeInstanceOf(PointBalanceError);
    expect(f.state.entries).toHaveLength(1);
  });
  it("records a reversal once and preserves the original adjustment", async () => {
    const f = fixture(); const original = await adjustPoints(f.database, f.input, f.context);
    const input = { customerId: f.input.customerId, requestKey: randomUUID(), entryId: original.entryId, expectedBalance: 10, reason: "元の入力を取り消す" };
    expect(await reversePointAdjustment(f.database, input, f.context)).toMatchObject({ balance: 0, replayed: false });
    expect(f.state.entries).toHaveLength(2);
    expect(f.state.entries[0].delta).toBe(10); expect(f.state.entries[1]).toMatchObject({ kind: "REVERSE", delta: -10, reversesEntryId: original.entryId, sequenceNumber: 2 });
    expect(await reversePointAdjustment(f.database, input, f.context)).toMatchObject({ replayed: true });
    await expect(reversePointAdjustment(f.database, { ...input, requestKey: randomUUID(), expectedBalance: 0 }, f.context)).rejects.toBeInstanceOf(PointConflictError);
  });
  it("cannot reverse a reversal or another customer's entry", async () => {
    const f = fixture(); const original = await adjustPoints(f.database, f.input, f.context);
    const reversal = await reversePointAdjustment(f.database, { customerId: f.input.customerId, requestKey: randomUUID(), entryId: original.entryId, expectedBalance: 10, reason: "取消" }, f.context);
    await expect(reversePointAdjustment(f.database, { customerId: f.input.customerId, requestKey: randomUUID(), entryId: reversal.entryId, expectedBalance: 0, reason: "再取消" }, f.context)).rejects.toBeInstanceOf(PointConflictError);
  });
  it("checks the current database role and rejects staff and inactive actors", async () => {
    const f = fixture(); f.state.role = "STAFF";
    await expect(adjustPoints(f.database, f.input, f.context)).rejects.toBeInstanceOf(PointPermissionError);
    f.state.role = "OWNER"; f.state.active = false;
    await expect(adjustPoints(f.database, f.input, f.context)).rejects.toBeInstanceOf(PointPermissionError);
    expect(f.state.entries).toHaveLength(0);
  });
  it("rejects inactive customers and staff participants", async () => {
    const f = fixture(); f.state.customerActive = false;
    await expect(adjustPoints(f.database, f.input, f.context)).rejects.toBeInstanceOf(PointCustomerUnavailableError);
    f.state.customerActive = true; f.state.staffCustomer = true;
    await expect(adjustPoints(f.database, f.input, f.context)).rejects.toBeInstanceOf(PointCustomerUnavailableError);
  });
  it("rolls back the ledger if audit logging fails", async () => {
    const f = fixture(); f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(adjustPoints(f.database, f.input, f.context)).rejects.toThrow("audit failed"); expect(f.state.entries).toHaveLength(0);
  });
  it.each([0, 0.5, NaN, Infinity, 2147483648, -2147483648])("rejects invalid point deltas %#", (delta) => {
    expect(pointAdjustmentSchema.safeParse({ customerId: "c", requestKey: randomUUID(), expectedBalance: 0, reason: "理由", delta }).success).toBe(false);
  });
});
