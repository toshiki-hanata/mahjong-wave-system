import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ iron: vi.fn(), save: vi.fn(), cookie: { staffId: "staff", storeId: "store", role: "STAFF", sessionVersion: 3, issuedAt: 1, lastActiveAt: 1 } }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("iron-session", () => ({ getIronSession: mock.iron }));
import { readAdminSession, touchAdminSession } from "./session";
const actor = { id: "staff", storeId: "store", sessionVersion: 3 };
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "fixture-session-secret-for-security-tests-only");
  mock.cookie = { staffId: "staff", storeId: "store", role: "STAFF", sessionVersion: 3, issuedAt: Date.now() - 600000, lastActiveAt: Date.now() - 120000 };
  mock.save.mockReset(); mock.iron.mockReset(); mock.iron.mockImplementation(async () => Object.assign(mock.cookie, { save: mock.save }));
});
afterEach(() => vi.unstubAllEnvs());
describe("activity renewal", () => {
  it("renews recent activity without resetting the absolute login time", async () => {
    const issuedAt = mock.cookie.issuedAt;
    const result = await touchAdminSession(actor);
    expect(result?.issuedAt).toBe(issuedAt); expect(result!.lastActiveAt).toBeGreaterThan(issuedAt);
    expect(mock.save).toHaveBeenCalledOnce();
    await touchAdminSession(actor); expect(mock.save).toHaveBeenCalledOnce();
  });
  it("does not revive expired, revoked or mismatched sessions", async () => {
    expect(await touchAdminSession({ ...actor, sessionVersion: 4 })).toBeNull();
    expect(await touchAdminSession({ ...actor, storeId: "other-store" })).toBeNull();
    mock.cookie.lastActiveAt = Date.now() - 1800000;
    expect(await touchAdminSession(actor)).toBeNull(); expect(mock.save).not.toHaveBeenCalled();
  });
  it("sets production Cookie protection and an eight-hour TTL", async () => {
    vi.stubEnv("NODE_ENV", "production"); await readAdminSession();
    expect(mock.iron.mock.calls[0][1]).toMatchObject({ ttl: 28800, cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" } });
  });
});
