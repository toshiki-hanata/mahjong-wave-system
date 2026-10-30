import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { quickReceptionSchema } from "./reception-schemas";
import { nextReceptionCode, ReceptionNameExistsError, ReceptionRequestConflictError, registerAndCheckIn } from "./reception-service";

const context = { storeId: "store-a", staffId: "staff-a" };
const input = { requestId: "28cf6981-38ae-492b-9395-5ab34df49aad", internalName: "山田 花子", confirmDifferentPerson: false };
type Customer = { id: string; storeId: string; internalName: string; customerCode: string; isActive: boolean };

function memoryDatabase(initial: Customer[] = []) {
  const state = { customers: [...initial], visits: [] as Array<{ id: string; customerId: string; status: string }>, audits: [] as Array<{ action: string }> };
  let storeActive = true;
  const tx = {
    businessDay: { findFirst: vi.fn(async () => ({ id: "business-1", closedAt: null })) },
    $queryRaw: vi.fn(async (query: TemplateStringsArray) => query.join("").includes('FROM "Store"')
      ? storeActive ? [{ id: context.storeId }] : []
      : [{ id: state.customers.at(-1)?.id, firstVisitAt: null, lastVisitAt: null }]),
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; storeId: string } }) => state.customers.find((row) => row.id === where.id && row.storeId === where.storeId) ?? null),
      findMany: vi.fn(async ({ where }: { where: { storeId: string } }) => state.customers.filter((row) => row.storeId === where.storeId)),
      create: vi.fn(async ({ data }: { data: Omit<Customer, "isActive"> }) => {
        const row = { ...data, isActive: true };
        state.customers.push(row);
        return row;
      }),
      update: vi.fn(async () => ({})),
    },
    visit: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: { customerId: string; status: string } }) => {
        const visit = { id: "visit-1", ...data };
        state.visits.push(visit);
        return visit;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: { data: { action: string } }) => { state.audits.push(data); return data; }) },
  };
  const database = {
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      const snapshot = structuredClone(state);
      try { return await callback(tx); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    },
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { database, tx, state, disableStore: () => { storeActive = false; } };
}

describe("Quick reception", () => {
  it("requires a name and request token, normalizes spaces, and rejects long names", () => {
    expect(quickReceptionSchema.parse({ ...input, internalName: "　山田　 花子　" }).internalName).toBe("山田 花子");
    expect(quickReceptionSchema.safeParse({ ...input, internalName: "　 " }).success).toBe(false);
    expect(quickReceptionSchema.safeParse({ ...input, internalName: "あ".repeat(121) }).success).toBe(false);
    expect(quickReceptionSchema.safeParse({ ...input, requestId: "invalid" }).success).toBe(false);
  });

  it("allocates after historical codes, including gaps, inactive records and large numbers", () => {
    expect(nextReceptionCode([])).toBe("W0001");
    expect(nextReceptionCode(["W0001", "W0196", "C-9999", "w0200"])).toBe("W0201");
    expect(nextReceptionCode(["W9999999999999999"])).toBe("W10000000000000000");
  });

  it("creates an automatically numbered private customer and WAITING Visit in one transaction", async () => {
    const memory = memoryDatabase();
    const result = await registerAndCheckIn(memory.database, input, context);
    expect(result).toMatchObject({ customerCode: "W0001", internalName: "山田 花子", replayed: false });
    expect(memory.tx.customer.create.mock.calls[0][0].data).toEqual({
      id: `reception-store-a-${input.requestId}`, storeId: "store-a", internalName: "山田 花子", customerCode: "W0001",
    });
    expect(memory.state.visits).toMatchObject([{ customerId: result.id, status: "WAITING" }]);
    expect(memory.state.audits.map((row) => row.action)).toEqual(["CUSTOMER_CREATE", "VISIT_CHECK_IN"]);
  });

  it("requires confirmation for names matching an inactive customer even with different spaces", async () => {
    const memory = memoryDatabase([{ id: "old", storeId: "store-a", customerCode: "W0090", internalName: "山田　花子", isActive: false }]);
    await expect(registerAndCheckIn(memory.database, input, context)).rejects.toBeInstanceOf(ReceptionNameExistsError);
    expect(memory.state.visits).toHaveLength(0);
    expect(memory.state.customers).toHaveLength(1);
    const result = await registerAndCheckIn(memory.database, { ...input, confirmDifferentPerson: true }, context);
    expect(result.customerCode).toBe("W0091");
    expect(memory.state.customers[0].isActive).toBe(false);
  });

  it("does not match or allocate using another store's customer", async () => {
    const memory = memoryDatabase([{ id: "other", storeId: "store-b", customerCode: "W9999", internalName: input.internalName, isActive: true }]);
    await expect(registerAndCheckIn(memory.database, input, context)).resolves.toMatchObject({ customerCode: "W0001" });
  });

  it("replays a double submission once, even after the original Visit is checked out", async () => {
    const memory = memoryDatabase();
    await registerAndCheckIn(memory.database, input, context);
    memory.state.visits[0].status = "CHECKED_OUT";
    await expect(registerAndCheckIn(memory.database, input, context)).resolves.toMatchObject({ replayed: true });
    expect(memory.state.customers).toHaveLength(1);
    expect(memory.state.visits).toHaveLength(1);
    expect(memory.state.audits).toHaveLength(2);
    await expect(registerAndCheckIn(memory.database, { ...input, internalName: "別の方" }, context)).rejects.toBeInstanceOf(ReceptionRequestConflictError);
  });

  it("rolls back the new customer and audit if check-in fails", async () => {
    const memory = memoryDatabase();
    memory.tx.visit.create.mockRejectedValueOnce(new Error("Visit write failed"));
    await expect(registerAndCheckIn(memory.database, input, context)).rejects.toThrow("Visit write failed");
    expect(memory.state).toEqual({ customers: [], visits: [], audits: [] });
  });

  it("blocks registration for an inactive or missing store", async () => {
    const memory = memoryDatabase();
    memory.disableStore();
    await expect(registerAndCheckIn(memory.database, input, context)).rejects.toThrow();
    expect(memory.tx.customer.create).not.toHaveBeenCalled();
  });
});
