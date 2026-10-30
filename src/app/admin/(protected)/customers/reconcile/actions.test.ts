import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ requireStaff: vi.fn(), preview: vi.fn(), database: {} }));
vi.mock("@/lib/auth/current-staff", () => ({ requireStaff: boundary.requireStaff }));
vi.mock("@/lib/prisma", () => ({ prisma: boundary.database }));
vi.mock("@/features/customers/roster-reconciliation-service", () => ({ previewRoster: boundary.preview }));
import { previewRosterAction } from "./actions";

beforeEach(() => {
  boundary.requireStaff.mockReset().mockResolvedValue({ id: "staff-a", storeId: "store-a" });
  boundary.preview.mockReset().mockResolvedValue({ results: [] });
});
describe("Roster preview authentication boundary", () => {
  it("rejects unauthenticated calls before reading the customer list", async () => {
    boundary.requireStaff.mockRejectedValueOnce(new Error("sign in required"));
    await expect(previewRosterAction({}, new FormData())).rejects.toThrow("sign in required");
    expect(boundary.preview).not.toHaveBeenCalled();
  });
  it("ignores forged store, role and customer identifiers", async () => {
    const form = new FormData();
    form.set("roster", "検証名"); form.set("storeId", "other-store"); form.set("role", "OWNER"); form.set("customerId", "other-customer");
    await previewRosterAction({}, form);
    expect(boundary.preview).toHaveBeenCalledWith(boundary.database, "store-a", "検証名");
  });
});
