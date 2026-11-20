import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ submit: vi.fn(), dbTouch: vi.fn(), requestHeaders: new Headers(), cookie: vi.fn(), permit: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: () => { f.dbTouch(); throw new Error("Unexpected database access"); } }) }));
vi.mock("@/lib/security/database-role", () => ({ assertRuntimeDatabaseRole: vi.fn() }));
vi.mock("@/features/qr-reception/service", () => ({ submitReceptionRequest: f.submit, QrReceptionError: class extends Error {} }));
vi.mock("next/headers", () => ({ headers: async () => f.requestHeaders, cookies: async () => ({ set: f.cookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { submitQrReceptionAction } from "@/app/reception/[storeId]/actions";
beforeEach(() => { vi.stubEnv("QR_RECEPTION_ENABLED", "true"); vi.stubEnv("APP_ORIGIN", "https://wave.example"); vi.stubEnv("SESSION_SECRET", "s".repeat(48)); vi.clearAllMocks(); f.requestHeaders = new Headers(); f.submit.mockResolvedValue({ receiptCode: "ABCDEF12" }); });
afterEach(() => vi.unstubAllEnvs());
const form = () => { const value = new FormData(); value.set("name", "架空 テスト"); value.set("token", "bounded-token"); return value; };
describe("QR submission is a limited public action", () => {
  it("does not touch business data when the feature is off", async () => { vi.stubEnv("QR_RECEPTION_ENABLED", "false"); expect((await submitQrReceptionAction("store", "1.key", {}, form())).message).toBeTruthy(); expect(f.submit).not.toHaveBeenCalled(); expect(f.dbTouch).not.toHaveBeenCalled(); });
  it("rejects a missing or foreign Origin before business access", async () => { for (const origin of [null, "https://other.example", "null"]) { f.requestHeaders = new Headers(origin ? { Origin: origin } : {}); expect((await submitQrReceptionAction("store", "1.key", {}, form())).message).toBeTruthy(); } expect(f.submit).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled(); });
  it("rejects invalid names and oversized links", async () => { f.requestHeaders = new Headers({ Origin: "https://wave.example" }); const bad = form(); bad.set("name", "x".repeat(121)); expect((await submitQrReceptionAction("store", "1.key", {}, bad)).message).toBeTruthy(); expect((await submitQrReceptionAction("store", "x".repeat(1000), {}, form())).message).toBeTruthy(); expect(f.submit).not.toHaveBeenCalled(); });
  it("stores a scoped HttpOnly receipt, never an admin or customer identity session", async () => { f.requestHeaders = new Headers({ Origin: "https://wave.example" }); expect(await submitQrReceptionAction("store", "1.key", {}, form())).toEqual({ success: true }); expect(f.cookie).toHaveBeenCalledTimes(1); const [name, , options] = f.cookie.mock.calls[0]; expect(name).toMatch(/^wave_qr_/); expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/reception/store" }); expect(f.submit).toHaveBeenCalledTimes(1); });
});
