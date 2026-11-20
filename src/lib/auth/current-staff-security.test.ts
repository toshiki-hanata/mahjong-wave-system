import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ read: vi.fn(), find: vi.fn(), mfa: vi.fn(), redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));
vi.mock("./session", () => ({ readAdminSession: mock.read }));
vi.mock("@/lib/prisma", () => ({ prisma: { staff: { findFirst: mock.find }, staffMfa: { findFirst: mock.mfa } } }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/lib/security/security-log", () => ({ logSecurityEvent: vi.fn() }));
import { getCurrentStaff, requireRole } from "./current-staff";

const cookie = () => ({ staffId: "fixture-staff", storeId: "fixture-store", role: "STAFF", sessionVersion: 7, issuedAt: Date.now() - 1000, lastActiveAt: Date.now() - 1000 });
const row = () => ({ id: "fixture-staff", storeId: "fixture-store", name: "架空スタッフ", role: "STAFF", isActive: true, sessionVersion: 7, store: { name: "架空店舗", timezone: "Asia/Tokyo", isActive: true } });
beforeEach(() => { vi.clearAllMocks(); mock.read.mockResolvedValue(cookie()); mock.find.mockResolvedValue(row()); });
describe("DB-backed staff session verification", () => {
  it.each(["OWNER", "MANAGER"])("rejects %s without MFA and accepts only the current enrolled proof", async role => {
    mock.find.mockResolvedValue({ ...row(), role });
    mock.read.mockResolvedValue({ ...cookie(), role });
    mock.mfa.mockResolvedValue({ enabledAt: new Date(), secretCiphertext: "fixture", version: 2 });
    expect(await getCurrentStaff()).toBeNull();
    mock.read.mockResolvedValue({ ...cookie(), role, mfaVerifiedAt: Date.now() - 2000, mfaVersion: 2 });
    expect(await getCurrentStaff()).toMatchObject({ role });
    mock.mfa.mockResolvedValue({ enabledAt: new Date(), secretCiphertext: "fixture", version: 3 });
    expect(await getCurrentStaff()).toBeNull();
    mock.mfa.mockResolvedValue({ enabledAt: new Date(), secretCiphertext: null, version: 2 });
    expect(await getCurrentStaff()).toBeNull();
  });
  it("does not read data for anonymous or legacy/expired sessions", async () => {
    mock.read.mockResolvedValue(null); expect(await getCurrentStaff()).toBeNull();
    mock.read.mockResolvedValue({ ...cookie(), issuedAt: undefined }); expect(await getCurrentStaff()).toBeNull();
    mock.read.mockResolvedValue({ ...cookie(), lastActiveAt: Date.now() - 1800000 }); expect(await getCurrentStaff()).toBeNull();
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("pins the database lookup to both signed identity and store", async () => {
    expect(await getCurrentStaff()).toMatchObject({ id: "fixture-staff", storeId: "fixture-store", sessionVersion: 7 });
    expect(mock.find.mock.calls[0][0].where).toEqual({ id: "fixture-staff", storeId: "fixture-store" });
  });
  it.each([
    () => null,
    () => ({ ...row(), isActive: false }),
    () => ({ ...row(), store: { ...row().store, isActive: false } }),
    () => ({ ...row(), role: "OWNER" }),
    () => ({ ...row(), sessionVersion: 8 }),
  ])("rejects unavailable, disabled, mismatched or revoked identity %#", async make => {
    mock.find.mockResolvedValue(make()); expect(await getCurrentStaff()).toBeNull();
  });
  it("does not upgrade STAFF because the caller asks for an OWNER operation", async () => {
    await expect(requireRole(["OWNER"])).rejects.toThrow("forbidden");
  });
  it("does not turn a DB outage into an authenticated identity", async () => {
    mock.find.mockRejectedValue(new Error("fixture DB unavailable"));
    await expect(getCurrentStaff()).rejects.toThrow();
  });
});
