import { describe, expect, it, vi } from "vitest";
import type { BusinessDay, PrismaClient } from "@prisma/client";
import { BusinessDayBlockedError, BusinessDayClosedError, BusinessDayNotFoundError, businessDayLabel, closeBusinessDay, openBusinessDay, requireOpenBusinessDay, updateFreeGamePrice } from "./business-day-service";
import { summarizeBusinessGames } from "./business-day-queries";

const context = { storeId: "store-a", staffId: "staff-a" };
function fixture() {
  const state = { days: [] as BusinessDay[], price: 2500, visits: 0, tables: 0, audits: [] as string[] };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: context.storeId, timezone: "Asia/Tokyo", freeGamePriceYen: state.price }]),
    businessDay: {
      findFirst: vi.fn(async ({ where }: { where: { storeId: string; id?: string; requestKey?: string; closedAt?: null } }) => state.days.find((day) => day.storeId === where.storeId && (!where.id || day.id === where.id) && (!where.requestKey || day.requestKey === where.requestKey) && (where.closedAt !== null || day.closedAt === null)) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<BusinessDay, "id" | "closedAt" | "closedByStaffId"> }) => {
        const day = { ...data, id: `day-${state.days.length + 1}`, closedAt: null, closedByStaffId: null };
        state.days.push(day); return day;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<BusinessDay> }) => Object.assign(state.days.find((day) => day.id === where.id)!, data)),
    },
    visit: { count: vi.fn(async () => state.visits) },
    tableSession: { count: vi.fn(async () => state.tables) },
    store: { update: vi.fn(async ({ data }: { data: { freeGamePriceYen: number } }) => { state.price = data.freeGamePriceYen; }) },
    auditLog: { create: vi.fn(async ({ data }: { data: { action: string } }) => { state.audits.push(data.action); }) },
  };
  const database = { $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
    const before = structuredClone(state);
    try { return await callback(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, tx, database };
}

describe("Business days", () => {
  it("uses the opening date in the store timezone", () => {
    expect(businessDayLabel(new Date("2026-10-29T15:30:00Z"), "Asia/Tokyo")).toBe("2026-10-30");
    expect(businessDayLabel(new Date("2026-10-29T15:30:00Z"), "America/Los_Angeles")).toBe("2026-10-29");
  });
  it("opens once and keeps the opening price", async () => {
    const f = fixture();
    const result = await openBusinessDay(f.database, "request-a", context);
    expect(result.day).toMatchObject({ storeId: "store-a", freeGamePriceYen: 2500, closedAt: null });
    expect(f.state.audits).toEqual(["BUSINESS_DAY_OPEN"]);
    expect((await openBusinessDay(f.database, "request-b", context)).replayed).toBe(true);
    expect(f.state.days).toHaveLength(1);
  });
  it("does not reopen a closed day when an old open request is retried", async () => {
    const f = fixture();
    const first = await openBusinessDay(f.database, "request-a", context);
    await closeBusinessDay(f.database, first.day.id, context);
    expect((await openBusinessDay(f.database, "request-a", context)).day.closedAt).toBeInstanceOf(Date);
    expect(f.state.days).toHaveLength(1);
    await openBusinessDay(f.database, "request-b", context);
    await closeBusinessDay(f.database, first.day.id, context);
    expect(f.state.days[1].closedAt).toBeNull();
  });
  it("blocks opening over unassigned activity and closing over visits or tables", async () => {
    const f = fixture(); f.state.visits = 1;
    await expect(openBusinessDay(f.database, "request-a", context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
    f.state.visits = 0;
    const { day } = await openBusinessDay(f.database, "request-a", context);
    f.state.tables = 1;
    await expect(closeBusinessDay(f.database, day.id, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
    expect(f.state.days[0].closedAt).toBeNull();
    f.state.tables = 0; f.state.visits = 1;
    await expect(closeBusinessDay(f.database, day.id, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
  });
  it("rejects another store's day and missing store", async () => {
    const f = fixture(); const { day } = await openBusinessDay(f.database, "a", context);
    await expect(closeBusinessDay(f.database, day.id, { ...context, storeId: "store-b" })).rejects.toBeInstanceOf(BusinessDayNotFoundError);
    f.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(openBusinessDay(f.database, "b", context)).rejects.toBeInstanceOf(BusinessDayNotFoundError);
  });
  it("requires an explicitly open day; midnight does not close it", async () => {
    const f = fixture();
    await expect(f.database.$transaction((tx) => requireOpenBusinessDay(tx, context.storeId))).rejects.toBeInstanceOf(BusinessDayClosedError);
    const { day } = await openBusinessDay(f.database, "a", context);
    f.state.days[0].openedAt = new Date("2026-01-01T00:00:00Z");
    await expect(f.database.$transaction((tx) => requireOpenBusinessDay(tx, context.storeId))).resolves.toMatchObject({ id: day.id });
  });
  it("changes future pricing without rewriting current or past pricing", async () => {
    const f = fixture(); const first = await openBusinessDay(f.database, "a", context);
    await updateFreeGamePrice(f.database, 3000, context);
    expect(f.state.days[0].freeGamePriceYen).toBe(2500);
    await closeBusinessDay(f.database, first.day.id, context);
    const second = await openBusinessDay(f.database, "b", context);
    expect(second.day.freeGamePriceYen).toBe(3000);
    await expect(updateFreeGamePrice(f.database, -1, context)).rejects.toThrow(RangeError);
  });
  it("rolls back opening if the audit fails", async () => {
    const f = fixture(); f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(openBusinessDay(f.database, "a", context)).rejects.toThrow("audit failed");
    expect(f.state.days).toHaveLength(0);
  });
  it("totals one completed hanchan as one game at its captured price", () => {
    expect(summarizeBusinessGames([{ count: 20, priceYen: 2500 }, { count: 1, priceYen: 3000 }])).toEqual({ games: 21, revenueYen: 53000 });
  });
});
