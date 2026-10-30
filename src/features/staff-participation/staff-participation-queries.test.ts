import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getStaffParticipationData } from "./staff-participation-queries";

function fixture(role: "OWNER" | "STAFF", actorFound = true) {
  const staff = [{ id: "staff-a", name: "本人", isActive: true, participantProfile: null }, { id: "staff-b", name: "別の人", isActive: true, participantProfile: null }];
  const tx = {
    staff: {
      findFirst: vi.fn(async () => actorFound ? { role } : null),
      findMany: vi.fn(async ({ where }: { where: { id?: string } }) => staff.filter((person) => !where.id || person.id === where.id)),
    },
    businessDay: { findMany: vi.fn(async () => []) },
    gamePlayerResult: { findMany: vi.fn(async () => []) },
  };
  const database = { $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx) } as unknown as PrismaClient;
  return { tx, database };
}
describe("Staff participation report authorization", () => {
  it("derives STAFF scope from the database and ignores a forged role field", async () => {
    const f = fixture("STAFF");
    const forged = { storeId: "store-a", staffId: "staff-a", role: "OWNER" };
    const result = await getStaffParticipationData(f.database, forged);
    expect(result?.staff.map((person) => person.id)).toEqual(["staff-a"]);
    expect(result?.canViewAll).toBe(false);
  });
  it("allows owner to see only staff queried within their store", async () => {
    const f = fixture("OWNER");
    const result = await getStaffParticipationData(f.database, { storeId: "store-a", staffId: "staff-a" });
    expect(result?.staff).toHaveLength(2);
    expect(f.tx.staff.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store-a" } }));
  });
  it("rejects unknown actors and another store's business day before fetching report rows", async () => {
    const absent = fixture("STAFF", false);
    expect(await getStaffParticipationData(absent.database, { storeId: "wrong-store", staffId: "staff-a" })).toBeNull();
    expect(absent.tx.staff.findMany).not.toHaveBeenCalled();
    const f = fixture("OWNER");
    expect(await getStaffParticipationData(f.database, { storeId: "store-a", staffId: "staff-a" }, "other-day")).toBeNull();
    expect(f.tx.gamePlayerResult.findMany).not.toHaveBeenCalled();
  });
});
