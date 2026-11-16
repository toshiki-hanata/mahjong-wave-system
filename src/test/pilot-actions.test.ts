import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ data: vi.fn(() => { throw new Error("UNEXPECTED_DATA_ACCESS"); }) }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: () => fixture.data() }) }));
vi.mock("@/lib/auth/current-staff", () => ({ requireStaff: async () => ({ id: "fixture-staff", storeId: "fixture-store", role: "STAFF" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import { claimPairingAction, readPairingAction, confirmPairingAction } from "@/app/member/link/actions";
import { issuePairingAction, confirmStaffPairingAction, cancelPairingAction } from "@/app/admin/(protected)/customers/[id]/link/actions";
import MemberLinkPage from "@/app/member/link/page";
beforeEach(() => {
  fixture.data.mockClear(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_AUTH_PRODUCTION_APPROVED", "true");
  vi.stubEnv("CUSTOMER_AUTH_ORIGIN", "https://members.example.com"); vi.stubEnv("CUSTOMER_AUTH_RP_ID", "members.example.com");
});
afterEach(() => vi.unstubAllEnvs());
describe("unfinished customer features stay closed in production", () => {
  it("rejects all public pairing Actions without any data lookup even with old approval flags", async () => {
    expect(await claimPairingAction("a".repeat(43))).toEqual({ state: "INVALID" });
    expect(await readPairingAction()).toEqual({ state: "INVALID" });
    expect(await confirmPairingAction()).toEqual({ state: "INVALID" });
    expect(fixture.data).not.toHaveBeenCalled();
  });
  it("rejects staff issue, confirm and cancel without touching data", async () => {
    const form = new FormData(); form.set("requestKey", "00000000-0000-4000-8000-000000000001"); form.set("pairingId", "fixture-pairing"); form.set("confirmed", "on");
    for (const action of [issuePairingAction, confirmStaffPairingAction, cancelPairingAction]) expect((await action("fixture-customer", {}, form)).message).toBeTruthy();
    expect(fixture.data).not.toHaveBeenCalled();
  });
  it("does not publish the unfinished customer page", () => {
    expect(() => MemberLinkPage()).toThrow("NOT_FOUND"); expect(fixture.data).not.toHaveBeenCalled();
  });
});
