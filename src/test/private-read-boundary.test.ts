import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ signedIn: true, customer: vi.fn(), performance: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/auth/current-staff", () => ({ requireStaff: async () => { if (!fixture.signedIn) throw new Error("SIGN_IN_REQUIRED"); return { id: "fixture-staff", storeId: "own-store", role: "STAFF", storeTimezone: "Asia/Tokyo" }; } }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { findFirst: fixture.customer }, store: { findUnique: async () => ({ timezone: "Asia/Tokyo" }) } } }));
vi.mock("@/features/rankings/ranking-queries", () => ({ getCustomerPerformance: fixture.performance }));
vi.mock("next/navigation", () => ({ notFound: fixture.notFound }));
import CustomerDetailPage from "@/app/admin/(protected)/customers/[id]/page";
beforeEach(() => { vi.clearAllMocks(); fixture.signedIn = true; fixture.customer.mockImplementation(async ({ where }) => where.storeId === "other-store" || !where.storeId ? { id: "other-customer", internalName: "別店舗の架空非公開名", note: "架空の非公開メモ" } : null); });
describe("customer ID substitution cannot cross a store boundary", () => {
  it("rejects anonymous direct page access before reading private information", async () => {
    fixture.signedIn = false;
    await expect(CustomerDetailPage({ params: Promise.resolve({ id: "other-customer" }) })).rejects.toThrow("SIGN_IN_REQUIRED");
    expect(fixture.customer).not.toHaveBeenCalled();
  });
  it("keeps the authenticated store even when the requested customer ID belongs elsewhere", async () => {
    await expect(CustomerDetailPage({ params: Promise.resolve({ id: "other-customer" }) })).rejects.toThrow("NOT_FOUND");
    expect(fixture.customer.mock.calls[0][0].where).toMatchObject({ storeId: "own-store", id: "other-customer" });
    expect(fixture.performance).not.toHaveBeenCalled();
  });
});
