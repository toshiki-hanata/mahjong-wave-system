import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { previewRoster } from "./roster-reconciliation-service";

describe("Read-only store-scoped roster preview", () => {
  it("queries only ordinary customers within the authenticated store, including inactive ones", async () => {
    const findMany = vi.fn(async () => [{ id: "a", internalName: "検証名", customerCode: "W0001", isActive: false }]);
    const database = { customer: { findMany } } as unknown as Pick<PrismaClient, "customer">;
    const result = await previewRoster(database, "store-a", "検証名");
    expect(findMany).toHaveBeenCalledWith({ where: { storeId: "store-a", participantStaffId: null }, orderBy: [{ internalName: "asc" }, { customerCode: "asc" }], take: 10001, select: { id: true, internalName: true, customerCode: true, isActive: true } });
    expect(result.results?.[0].status).toBe("inactive");
  });
  it("does not access the database for invalid input", async () => {
    const findMany = vi.fn();
    const database = { customer: { findMany } } as unknown as Pick<PrismaClient, "customer">;
    expect((await previewRoster(database, "store-a", "a\tb\tc")).message).toBeTruthy();
    expect(findMany).not.toHaveBeenCalled();
  });
  it("fails closed if a complete scan is unavailable instead of showing false unmatched rows", async () => {
    const database = { customer: { findMany: vi.fn(async () => Array.from({ length: 10001 }, () => ({ id: "a", internalName: "同名", customerCode: "W1", isActive: true }))) } } as unknown as Pick<PrismaClient, "customer">;
    const result = await previewRoster(database, "store-a", "別名");
    expect(result.results).toBeUndefined();
    expect(result.message).toContain("上限");
  });
});
