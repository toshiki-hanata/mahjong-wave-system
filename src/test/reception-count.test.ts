import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const f = vi.hoisted(() => ({ staff: vi.fn(), quota: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth/current-staff", () => ({ getCurrentStaff: f.staff }));
vi.mock("@/lib/auth/staff-action-quota", () => ({ reserveStaffAction: f.quota }));
vi.mock("@/features/qr-reception/queries", () => ({ pendingReceptionCount: f.count }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { GET } from "@/app/api/staff/reception-count/route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("QR_RECEPTION_ENABLED", "true"); vi.stubEnv("APP_ORIGIN", "https://wave.example"); f.staff.mockResolvedValue({ id: "actor", storeId: "authenticated-store" }); f.quota.mockResolvedValue(true); f.count.mockResolvedValue(2); });
afterEach(() => vi.unstubAllEnvs());
describe("staff reception count is a limited authenticated read", () => {
  it("rejects a guest without reading counts or redirecting their page", async () => { f.staff.mockResolvedValue(null); const r = await GET(new NextRequest("https://wave.example/api/staff/reception-count")); expect(r.status).toBe(401); expect(f.count).not.toHaveBeenCalled(); expect(r.headers.has("Location")).toBe(false); });
  it("rejects a foreign Origin before authentication", async () => { const r = await GET(new NextRequest("https://wave.example/api/staff/reception-count", { headers: { Origin: "https://other.example" } })); expect(r.status).toBe(403); expect(f.staff).not.toHaveBeenCalled(); });
  it("ignores caller supplied store/customer IDs and returns only a count", async () => { const r = await GET(new NextRequest("https://wave.example/api/staff/reception-count?storeId=other&customerId=other")); expect(await r.json()).toEqual({ count: 2, enabled: true }); expect(f.count).toHaveBeenCalledWith({}, "authenticated-store"); expect(r.headers.get("Cache-Control")).toContain("no-store"); });
  it("enforces the shared authenticated quota", async () => { f.quota.mockResolvedValue(false); const r = await GET(new NextRequest("https://wave.example/api/staff/reception-count")); expect(r.status).toBe(429); expect(f.count).not.toHaveBeenCalled(); });
  it("does not query the queue when the feature is off", async () => { vi.stubEnv("QR_RECEPTION_ENABLED", "false"); expect(await (await GET(new NextRequest("https://wave.example/api/staff/reception-count"))).json()).toEqual({ count: 0, enabled: false }); expect(f.count).not.toHaveBeenCalled(); });
});
