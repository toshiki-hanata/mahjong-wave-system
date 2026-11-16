import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ request: new Headers(), reserve: vi.fn(), redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }) }));
vi.mock("next/headers", () => ({ headers: async () => mock.request }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("./staff-action-quota", () => ({ reserveStaffAction: mock.reserve, StaffActionIdentityError: class extends Error {} }));
vi.mock("@/lib/security/security-log", () => ({ logSecurityEvent: vi.fn() }));
import { requireStaffActionPermit } from "./staff-action-permit";
const actor = { id: "fixture-staff", storeId: "fixture-store", role: "STAFF" as const, name: "架空スタッフ", storeName: "架空店舗", storeTimezone: "Asia/Tokyo", sessionVersion: 1, sessionIssuedAt: Date.now(), sessionLastActiveAt: Date.now() };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://app.example"); mock.request = new Headers({ origin: "https://app.example", host: "app.example" }); mock.reserve.mockResolvedValue(true); });
afterEach(() => vi.unstubAllEnvs());
describe("important mutation permit", () => {
  it("checks a same-origin request and passes only the authenticated actor to the shared quota", async () => {
    await expect(requireStaffActionPermit(actor)).resolves.toBeUndefined(); expect(mock.reserve).toHaveBeenCalledWith({}, actor);
  });
  it.each([null, "null", "https://attacker.example"])("rejects invalid Origin before a data quota reservation: %s", async origin => {
    if (origin === null) mock.request.delete("origin"); else mock.request.set("origin", origin);
    await expect(requireStaffActionPermit(actor)).rejects.toThrow("invalid-origin"); expect(mock.reserve).not.toHaveBeenCalled();
  });
  it("blocks a saturated quota and does not treat an outage as an allowance", async () => {
    mock.reserve.mockResolvedValue(false); await expect(requireStaffActionPermit(actor)).rejects.toThrow("action-rate-limited");
    mock.reserve.mockRejectedValue(new Error("fixture-secret-database-message"));
    await expect(requireStaffActionPermit(actor)).rejects.toThrow("安全確認");
  });
});
