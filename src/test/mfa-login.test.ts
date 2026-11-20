import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ authenticate: vi.fn(), begin: vi.fn(), write: vi.fn(), destroy: vi.fn(), writePending: vi.fn(), clearPending: vi.fn(), completeRate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/security/database-role", () => ({ assertRuntimeDatabaseRole: vi.fn() }));
vi.mock("@/lib/security/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/auth/credentials", () => ({ authenticateStaff: mock.authenticate }));
vi.mock("@/lib/auth/mfa/service", () => ({ beginMfaChallenge: mock.begin }));
vi.mock("@/lib/auth/mfa/pending-cookie", () => ({ writeMfaPendingToken: mock.writePending, clearMfaPendingToken: mock.clearPending }));
vi.mock("@/lib/auth/session", () => ({ writeAdminSession: mock.write, destroyAdminSession: mock.destroy }));
vi.mock("@/lib/auth/login-rate-limit", () => ({ reserveLoginAttempt: vi.fn(async () => ({ allowed: true, delayMs: 0, keys: [] })), completeSuccessfulLogin: mock.completeRate }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
import { loginAction } from "@/app/admin/login/actions";
const staff = { id: "fixture", storeId: "fixture", role: "OWNER", sessionVersion: 0 };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("SESSION_SECRET", "a-long-fixture-session-secret-for-tests-only"); mock.authenticate.mockResolvedValue(staff); mock.begin.mockResolvedValue({ status: "PENDING", token: "pending-fixture" }); });
afterEach(() => vi.unstubAllEnvs());
describe("password login cannot bypass administrator MFA", () => {
  const input = () => { const f = new FormData(); f.set("loginId", "fixture"); f.set("password", "fixture-password"); return f; };
  it.each(["OWNER", "MANAGER"])("creates only a restricted challenge for %s after correct password", async role => {
    mock.authenticate.mockResolvedValue({ ...staff, role });
    await expect(loginAction({}, input())).rejects.toThrow("REDIRECT:/admin/mfa");
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.completeRate).not.toHaveBeenCalled(); expect(mock.writePending).toHaveBeenCalledWith("pending-fixture");
  });
  it("does not bypass unprovisioned MFA", async () => {
    mock.begin.mockResolvedValue({ status: "SETUP_REQUIRED" }); expect((await loginAction({}, input())).message).toContain("初回登録コード"); expect(mock.write).not.toHaveBeenCalled();
  });
  it("keeps the ordinary STAFF login path", async () => {
    mock.authenticate.mockResolvedValue({ ...staff, role: "STAFF" });
    await expect(loginAction({}, input())).rejects.toThrow("REDIRECT:/admin"); expect(mock.write).toHaveBeenCalled(); expect(mock.begin).not.toHaveBeenCalled();
  });
  it("cannot start MFA with an incorrect password", async () => {
    mock.authenticate.mockResolvedValue(null); expect((await loginAction({}, input())).message).toBeTruthy(); expect(mock.begin).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
});
