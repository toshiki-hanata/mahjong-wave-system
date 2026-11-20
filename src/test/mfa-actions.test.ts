import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ origin: vi.fn(), token: vi.fn(), writePending: vi.fn(), clearPending: vi.fn(), writeSession: vi.fn(), destroySession: vi.fn(), complete: vi.fn(), recover: vi.fn(), acknowledge: vi.fn(), cancel: vi.fn(), role: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/security/database-role", () => ({ assertRuntimeDatabaseRole: vi.fn() }));
vi.mock("@/lib/security/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/auth/mfa/origin", () => ({ requireMfaOrigin: mock.origin }));
vi.mock("@/lib/auth/mfa/pending-cookie", () => ({ readMfaPendingToken: mock.token, writeMfaPendingToken: mock.writePending, clearMfaPendingToken: mock.clearPending }));
vi.mock("@/lib/auth/session", () => ({ writeAdminSession: mock.writeSession, destroyAdminSession: mock.destroySession }));
vi.mock("@/lib/auth/mfa/service", () => ({ completeMfaChallenge: mock.complete, recoverMfaChallenge: mock.recover, acknowledgeMfaCodes: mock.acknowledge, cancelMfaChallenge: mock.cancel, beginMfaReplacement: mock.replace }));
vi.mock("@/lib/auth/current-staff", () => ({ requireRole: mock.role }));
vi.mock("@/lib/auth/staff-action-permit", () => ({ requireStaffActionPermit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
import { acknowledgeMfaAction, recoverMfaAction, verifyMfaAction } from "@/app/admin/mfa/actions";
import { replaceStaffMfaAction } from "@/app/admin/(protected)/security/mfa/actions";
const form = (data: Record<string, string>) => { const value = new FormData(); for (const [key, item] of Object.entries(data)) value.set(key, item); return value; };
beforeEach(() => { vi.resetAllMocks(); mock.token.mockResolvedValue(null); mock.complete.mockResolvedValue({ status: "INVALID" }); mock.recover.mockResolvedValue({ status: "INVALID" }); mock.acknowledge.mockResolvedValue({ status: "INVALID" }); });
describe("MFA Server Action authentication stages", () => {
  it("does not issue a session for anonymous code, recovery, or receipt requests", async () => {
    expect((await verifyMfaAction({}, form({ code: "123456" }))).message).toBeTruthy();
    expect((await recoverMfaAction({}, form({ recoveryCode: "a".repeat(32) }))).message).toBeTruthy();
    expect((await acknowledgeMfaAction({}, form({ saved: "on" }))).message).toBeTruthy();
    expect(mock.writeSession).not.toHaveBeenCalled();
  });
  it("rejects foreign-origin requests before reading a pending identity or changing auth state", async () => {
    mock.origin.mockRejectedValue(new Error("FOREIGN_ORIGIN"));
    await verifyMfaAction({}, form({ code: "123456" })); await recoverMfaAction({}, form({ recoveryCode: "a".repeat(32) })); await acknowledgeMfaAction({}, form({ saved: "on" }));
    expect(mock.token).not.toHaveBeenCalled(); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.writeSession).not.toHaveBeenCalled();
  });
  it("keeps code acknowledgment in a restricted stage without creating a privileged session", async () => {
    mock.complete.mockResolvedValue({ status: "CODES", token: "new-receipt-token" });
    await expect(verifyMfaAction({}, form({ code: "123456" }))).rejects.toThrow("REDIRECT:/admin/mfa");
    expect(mock.writePending).toHaveBeenCalledWith("new-receipt-token"); expect(mock.writeSession).not.toHaveBeenCalled();
  });
  it("recovery grants only re-enrollment, clears a previous session and never authenticates the account directly", async () => {
    mock.recover.mockResolvedValue({ status: "PENDING", token: "new-replacement-token" });
    await expect(recoverMfaAction({}, form({ recoveryCode: "a".repeat(32) }))).rejects.toThrow("REDIRECT:/admin/mfa");
    expect(mock.destroySession).toHaveBeenCalledOnce(); expect(mock.writeSession).not.toHaveBeenCalled();
  });
  it("requires explicit receipt acknowledgment", async () => {
    expect((await acknowledgeMfaAction({}, form({}))).message).toBeTruthy(); expect(mock.acknowledge).not.toHaveBeenCalled();
  });
  it("issues only the server-returned MFA grant and clears the pending cookie", async () => {
    const grant = { staffId: "fixture", storeId: "fixture", role: "OWNER", sessionVersion: 4, mfa: { verifiedAt: Date.now(), version: 2 } };
    mock.acknowledge.mockResolvedValue({ status: "COMPLETE", grant });
    await expect(acknowledgeMfaAction({}, form({ saved: "on", role: "STAFF", staffId: "forged" }))).rejects.toThrow("REDIRECT:/admin");
    expect(mock.writeSession).toHaveBeenCalledWith(grant); expect(mock.clearPending).toHaveBeenCalledOnce();
  });
  it("checks administrator authority before replacement even if the caller supplies a valid-looking form", async () => {
    mock.role.mockRejectedValue(new Error("ROLE_DENIED"));
    await expect(replaceStaffMfaAction({}, form({ password: "fixture", code: "123456", role: "OWNER" }))).rejects.toThrow("ROLE_DENIED");
    expect(mock.replace).not.toHaveBeenCalled();
  });
});
