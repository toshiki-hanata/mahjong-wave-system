import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => mock }));
import { clearMfaPendingToken, MFA_COOKIE_NAME, readMfaPendingToken, writeMfaPendingToken } from "./pending-cookie";
beforeEach(() => vi.resetAllMocks()); afterEach(() => vi.unstubAllEnvs());
describe("restricted MFA pending cookie", () => {
  const packed = "a".repeat(43) + "." + "b".repeat(43);
  it("uses an HttpOnly secure five-minute cookie in production, distinct from the administrator cookie", async () => {
    vi.stubEnv("NODE_ENV", "production"); await writeMfaPendingToken(packed);
    expect(mock.set).toHaveBeenCalledWith(MFA_COOKIE_NAME, packed, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin", maxAge: 300 });
    expect(MFA_COOKIE_NAME).not.toBe("mahjong_admin");
  });
  it("rejects an unsigned raw pointer and malformed cookies", async () => {
    mock.get.mockReturnValue({ value: "a".repeat(43) }); expect(await readMfaPendingToken()).toBeNull();
    await expect(writeMfaPendingToken("a".repeat(43))).rejects.toThrow(); expect(mock.set).not.toHaveBeenCalled();
  });
  it("clears the same cookie scope on cancellation or completed authentication", async () => {
    await clearMfaPendingToken(); expect(mock.set.mock.calls[0][0]).toBe(MFA_COOKIE_NAME); expect(mock.set.mock.calls[0][2]).toMatchObject({ path: "/admin", maxAge: 0, httpOnly: true });
  });
});
