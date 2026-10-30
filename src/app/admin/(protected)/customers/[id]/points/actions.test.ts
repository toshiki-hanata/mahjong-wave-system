import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ requireRole: vi.fn(), readDatabase: vi.fn(() => { throw new Error("database must not be read"); }) }));
vi.mock("@/lib/auth/current-staff", () => ({ requireRole: boundary.requireRole }));
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: () => boundary.readDatabase() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { adjustPointsAction, reversePointsAction } from "./actions";
beforeEach(() => { boundary.requireRole.mockReset(); boundary.readDatabase.mockClear(); });
describe("Point adjustment action permission boundaries", () => {
  it.each([adjustPointsAction, reversePointsAction])("requires OWNER/MANAGER before any data access %#", async (action) => {
    boundary.requireRole.mockRejectedValueOnce(new Error("forbidden"));
    const form = new FormData(); form.set("role", "OWNER"); form.set("storeId", "foreign");
    await expect(action("foreign-customer", {}, form)).rejects.toThrow("forbidden");
    expect(boundary.requireRole).toHaveBeenCalledWith(["OWNER", "MANAGER"]); expect(boundary.readDatabase).not.toHaveBeenCalled();
  });
  it("rejects an invalid amount before trying to save", async () => {
    boundary.requireRole.mockResolvedValue({ id: "owner-a", storeId: "store-a" });
    const form = new FormData(); form.set("amount", "-10"); form.set("direction", "subtract");
    expect((await adjustPointsAction("customer-a", {}, form)).message).toBeTruthy(); expect(boundary.readDatabase).not.toHaveBeenCalled();
  });
});
