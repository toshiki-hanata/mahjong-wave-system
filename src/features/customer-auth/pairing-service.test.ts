import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createAuthToken, hashAuthToken, isAuthToken } from "./auth-tokens";
import { issueCustomerPairing, claimCustomerPairing, confirmCustomerPairing, confirmStaffPairing, cancelCustomerPairing, CustomerLinkError, CustomerLinkRateError } from "./pairing-service";

type Row = { id: string; storeId: string; customerId: string; issuedByStaffId: string; requestKey: string; tokenHash: string; claimHash: string | null; confirmationCode: string | null; failedClaims: number; createdAt: Date; expiresAt: Date; claimedAt: Date | null; staffConfirmedAt: Date | null; customerConfirmedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null };
function fixture() {
  const state = { rows: [] as Row[], active: true, activated: false, audits: [] as unknown[] };
  const context = { storeId: "store-a", staffId: "staff-a" };
  const tx = {
    $queryRaw: vi.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => sql.join("").includes('FROM "Store"') ? values[0] === "store-a" ? [{ id: "store-a" }] : [] : state.rows.filter((row) => row.id === values[0] && row.storeId === values[1])),
    staff: { findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string } }) => state.active && where.id === "staff-a" && where.storeId === "store-a" ? { id: "staff-a" } : null) },
    customer: { findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string } }) => where.id === "customer-a" && where.storeId === "store-a" ? { id: "customer-a", authIdentity: state.activated ? { activatedAt: new Date() } : null } : null) },
    customerAuthIdentity: { upsert: vi.fn(async () => ({ id: "identity-a" })) },
    customerPairing: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; storeId?: string; requestKey?: string } }) => state.rows.find((row) => (!where.id || row.id === where.id) && (!where.storeId || row.storeId === where.storeId) && (!where.requestKey || row.requestKey === where.requestKey)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash?: string; claimHash?: string } }) => state.rows.find((row) => where.tokenHash ? row.tokenHash === where.tokenHash : row.claimHash === where.claimHash) ?? null),
      count: vi.fn(async () => state.rows.length),
      create: vi.fn(async ({ data }: { data: Pick<Row, "storeId" | "customerId" | "issuedByStaffId" | "requestKey" | "tokenHash" | "createdAt" | "expiresAt"> }) => {
        const row: Row = { ...data, id: `pair-${state.rows.length + 1}`, claimHash: null, confirmationCode: null, failedClaims: 0, claimedAt: null, staffConfirmedAt: null, customerConfirmedAt: null, completedAt: null, cancelledAt: null }; state.rows.push(row); return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(state.rows.find((row) => row.id === where.id)!, data)),
      updateMany: vi.fn(async ({ data }: { data: Partial<Row> }) => { for (const row of state.rows) if (!row.completedAt && !row.cancelledAt) Object.assign(row, data); }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => { state.audits.push(data); }) },
  };
  const database = { $transaction: async <T>(fn: (client: unknown) => Promise<T>) => { const before = structuredClone(state); try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; } } } as unknown as PrismaClient;
  return { state, tx, database, context, input: { customerId: "customer-a", requestKey: randomUUID() } };
}
afterEach(() => vi.useRealTimers());
describe("Customer pairing security", () => {
  it("generates independent high-entropy tokens and stores hashes only", async () => {
    const f = fixture(), result = await issueCustomerPairing(f.database, f.input, f.context);
    expect(isAuthToken(result.token)).toBe(true); expect(createAuthToken()).not.toBe(result.token);
    expect(f.state.rows[0].tokenHash).toBe(hashAuthToken(result.token!));
    expect(JSON.stringify(f.state)).not.toContain(result.token!);
    expect(f.state.rows[0].claimHash).toBeNull();
  });
  it("replays issuance without recovering secrets and invalidates old QR on reissue", async () => {
    const f = fixture(), first = await issueCustomerPairing(f.database, f.input, f.context);
    expect((await issueCustomerPairing(f.database, f.input, f.context)).token).toBeNull();
    await issueCustomerPairing(f.database, { ...f.input, requestKey: randomUUID() }, f.context);
    expect(f.state.rows[0].cancelledAt).not.toBeNull();
    expect((await claimCustomerPairing(f.database, first.token, createAuthToken())).state).toBe("INVALID");
  });
  it("requires both confirmations and does not activate the account or complete a pairing", async () => {
    const f = fixture(), issued = await issueCustomerPairing(f.database, f.input, f.context), claim = createAuthToken();
    const claimed = await claimCustomerPairing(f.database, issued.token, claim);
    expect(claimed.state).toBe("CONFIRM"); expect(claimed.confirmationCode).toMatch(/^\d{6}$/);
    expect((await confirmCustomerPairing(f.database, claim)).state).toBe("CONFIRM");
    await confirmStaffPairing(f.database, issued.pairingId, f.input.customerId, f.context);
    expect((await confirmCustomerPairing(f.database, claim)).state).toBe("READY");
    expect(f.state.rows[0].completedAt).toBeNull(); expect(f.state.activated).toBe(false);
    expect(JSON.stringify(f.state.audits)).not.toContain(claim);
  });
  it("rejects a staff confirmation before claim and a different browser's confirmation", async () => {
    const f = fixture(), issued = await issueCustomerPairing(f.database, f.input, f.context);
    await expect(confirmStaffPairing(f.database, issued.pairingId, f.input.customerId, f.context)).rejects.toBeInstanceOf(CustomerLinkError);
    await claimCustomerPairing(f.database, issued.token, createAuthToken());
    await expect(confirmCustomerPairing(f.database, createAuthToken())).rejects.toBeInstanceOf(CustomerLinkError);
  });
  it("blocks stolen-token first-claim replacement and persists an attempt limit", async () => {
    const f = fixture(), issued = await issueCustomerPairing(f.database, f.input, f.context), claim = createAuthToken();
    await claimCustomerPairing(f.database, issued.token, claim);
    for (let i = 0; i < 5; i++) expect((await claimCustomerPairing(f.database, issued.token, createAuthToken())).state).toBe("INVALID");
    expect(f.state.rows[0].claimHash).toBe(hashAuthToken(claim)); expect(f.state.rows[0].failedClaims).toBe(5); expect(f.state.rows[0].cancelledAt).not.toBeNull();
    expect((await claimCustomerPairing(f.database, issued.token, claim)).state).toBe("INVALID");
  });
  it("rejects expired and cancelled QR even after both confirmations", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    const f = fixture(), issued = await issueCustomerPairing(f.database, f.input, f.context), claim = createAuthToken();
    await claimCustomerPairing(f.database, issued.token, claim); await confirmCustomerPairing(f.database, claim); await confirmStaffPairing(f.database, issued.pairingId, f.input.customerId, f.context);
    vi.setSystemTime(issued.expiresAt);
    await expect(confirmCustomerPairing(f.database, claim)).rejects.toBeInstanceOf(CustomerLinkError);
    expect((await claimCustomerPairing(f.database, issued.token, claim)).state).toBe("INVALID");
  });
  it("binds staff confirmation and cancellation to the displayed customer and store", async () => {
    const f = fixture(), issued = await issueCustomerPairing(f.database, f.input, f.context);
    await claimCustomerPairing(f.database, issued.token, createAuthToken());
    await expect(confirmStaffPairing(f.database, issued.pairingId, "other-customer", f.context)).rejects.toBeInstanceOf(CustomerLinkError);
    await expect(cancelCustomerPairing(f.database, issued.pairingId, "other-customer", f.context)).rejects.toBeInstanceOf(CustomerLinkError);
    await expect(confirmStaffPairing(f.database, issued.pairingId, f.input.customerId, { storeId: "store-b", staffId: "staff-a" })).rejects.toThrow();
    expect(f.state.rows[0].staffConfirmedAt).toBeNull(); expect(f.state.rows[0].cancelledAt).toBeNull();
  });
  it("cannot use staff-issued initial QR to replace an already activated identity", async () => {
    const f = fixture(); f.state.activated = true;
    await expect(issueCustomerPairing(f.database, f.input, f.context)).rejects.toBeInstanceOf(CustomerLinkError);
    expect(f.state.rows).toHaveLength(0);
  });
  it("rejects inactive staff, malformed tokens and excessive issuance", async () => {
    const f = fixture(); f.state.active = false;
    await expect(issueCustomerPairing(f.database, f.input, f.context)).rejects.toBeInstanceOf(CustomerLinkError);
    expect((await claimCustomerPairing(f.database, "bad", createAuthToken())).state).toBe("INVALID");
    f.state.active = true;
    for (let i = 0; i < 10; i++) await issueCustomerPairing(f.database, { ...f.input, requestKey: randomUUID() }, f.context);
    await expect(issueCustomerPairing(f.database, { ...f.input, requestKey: randomUUID() }, f.context)).rejects.toBeInstanceOf(CustomerLinkRateError);
  });
  it("rolls back issuance if the audit fails", async () => {
    const f = fixture(); f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(issueCustomerPairing(f.database, f.input, f.context)).rejects.toThrow("audit failed"); expect(f.state.rows).toHaveLength(0);
  });
});
