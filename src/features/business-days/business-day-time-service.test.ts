import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { BusinessDay, PrismaClient, Role } from "@prisma/client";
import { BusinessDayBlockedError, BusinessDayNotFoundError } from "./business-day-service";
import { businessLocalDateTime, BusinessDayTimeValidationError, type BusinessDayTimeInput } from "./business-day-time";
import { BusinessDayTimeChangedError, BusinessDayTimePermissionError, updateBusinessDayTimes } from "./business-day-time-service";

const context = { storeId: "store-a", staffId: "manager-a" };
const at = (hours: number) => new Date(Date.UTC(2026, 0, 1, hours));

function fixture(closed = false) {
  const day: BusinessDay = { id: "day-a", storeId: context.storeId, requestKey: "open-key", label: "2026-01-01", timezone: "Asia/Tokyo", freeGamePriceYen: 2500, openedAt: new Date("2026-01-01T00:00:00.123Z"), closedAt: closed ? new Date("2026-01-01T04:00:00.456Z") : null, openedByStaffId: context.staffId, closedByStaffId: closed ? "original-closer" : null };
  const state = {
    days: [day], role: "OWNER" as Role, active: true, openVisits: 0, activeTables: 0,
    visits: { _min: { checkedInAt: at(1) }, _max: { checkedInAt: at(1), checkedOutAt: at(3) } },
    sessions: { _min: { startedAt: at(1) }, _max: { startedAt: at(1), endedAt: at(3) } },
    games: { _min: { effectiveAt: at(2) }, _max: { effectiveAt: at(2) } },
    audits: [] as Array<{ action: string; metadata: Record<string, unknown> }>,
  };
  type DayWhere = { storeId: string; id: string | { not: string }; openedAt?: { lt: Date }; OR?: Array<{ closedAt: null | { gt: Date } }> };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: context.storeId, timezone: "Asia/Tokyo", freeGamePriceYen: 2500 }]),
    staff: { findFirst: vi.fn(async ({ where }: { where: { storeId: string; id: string } }) => state.active && where.storeId === context.storeId && where.id === context.staffId ? { role: state.role } : null) },
    businessDay: {
      findFirst: vi.fn(async ({ where }: { where: DayWhere }) => {
        const id = where.id;
        if (typeof id === "string") return structuredClone(state.days.find((row) => row.id === id && row.storeId === where.storeId) ?? null);
        const lower = where.OR?.find((row) => row.closedAt !== null)?.closedAt;
        return structuredClone(state.days.find((row) => row.storeId === where.storeId && row.id !== id.not && (!where.openedAt || row.openedAt < where.openedAt.lt) && (!row.closedAt || (lower && row.closedAt > lower.gt))) ?? null);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<BusinessDay> }) => Object.assign(state.days.find((row) => row.id === where.id)!, data)),
    },
    visit: { count: vi.fn(async () => state.openVisits), aggregate: vi.fn(async () => structuredClone(state.visits)) },
    tableSession: { count: vi.fn(async () => state.activeTables), aggregate: vi.fn(async () => structuredClone(state.sessions)) },
    game: { aggregate: vi.fn(async () => structuredClone(state.games)) },
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { metadata: { equals: string } } }) => state.audits.find((row) => row.metadata.requestKey === where.metadata.equals) ?? null),
      create: vi.fn(async ({ data }: { data: { action: string; metadata: Record<string, unknown> } }) => { state.audits.push(data); }),
    },
  };
  const database = { $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    const before = structuredClone(state);
    try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const input: BusinessDayTimeInput = { businessDayId: day.id, requestKey: randomUUID(), mode: "edit", expectedOpenedAt: day.openedAt.toISOString(), expectedClosedAt: day.closedAt?.toISOString() ?? "", openedAtLocal: "2026-01-01T08:00:00", closedAtLocal: day.closedAt ? businessLocalDateTime(day.closedAt, day.timezone) : "", reason: "開始を押した時刻が遅れていたため" };
  return { state, tx, database, input };
}

describe("Business day time corrections", () => {
  it.each(["OWNER", "MANAGER"] as const)("lets %s correct the opening date with before/after and reason", async (role) => {
    const f = fixture(); f.state.role = role;
    await updateBusinessDayTimes(f.database, { ...f.input, openedAtLocal: "2025-12-31T23:00" }, context);
    expect(f.state.days[0]).toMatchObject({ label: "2025-12-31", openedAt: new Date("2025-12-31T14:00Z"), closedAt: null, freeGamePriceYen: 2500 });
    expect(f.state.audits[0]).toMatchObject({ action: "BUSINESS_DAY_TIME_UPDATE", metadata: {
      reason: f.input.reason, before: { openedAt: f.input.expectedOpenedAt, closedAt: null, label: "2026-01-01" },
      after: { openedAt: "2025-12-31T14:00:00.000Z", closedAt: null, label: "2025-12-31" },
    } });
  });
  it("blocks staff, inactive staff, and another store", async () => {
    const f = fixture(); f.state.role = "STAFF";
    await expect(updateBusinessDayTimes(f.database, f.input, context)).rejects.toBeInstanceOf(BusinessDayTimePermissionError);
    f.state.role = "OWNER"; f.state.active = false;
    await expect(updateBusinessDayTimes(f.database, f.input, context)).rejects.toBeInstanceOf(BusinessDayTimePermissionError);
    f.state.active = true;
    await expect(updateBusinessDayTimes(f.database, f.input, { ...context, storeId: "other" })).rejects.toBeInstanceOf(BusinessDayTimePermissionError);
    await expect(updateBusinessDayTimes(f.database, { ...f.input, businessDayId: "other-day" }, context)).rejects.toBeInstanceOf(BusinessDayNotFoundError);
    expect(f.state.audits).toHaveLength(0);
  });
  it("requires a reason even for direct service calls", async () => {
    const f = fixture();
    await expect(updateBusinessDayTimes(f.database, { ...f.input, reason: "  " }, context)).rejects.toBeInstanceOf(BusinessDayTimeValidationError);
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it("closes a forgotten open day at the specified time and keeps all activity untouched", async () => {
    const f = fixture(); const records = structuredClone({ visits: f.state.visits, sessions: f.state.sessions, games: f.state.games });
    await updateBusinessDayTimes(f.database, { ...f.input, mode: "close", closedAtLocal: "2026-01-01T13:00" }, context);
    expect(f.state.days[0]).toMatchObject({ closedAt: at(4), closedByStaffId: context.staffId });
    expect({ visits: f.state.visits, sessions: f.state.sessions, games: f.state.games }).toEqual(records);
  });
  it("blocks forgotten close while any store visits or tables remain open", async () => {
    const f = fixture(); const input = { ...f.input, mode: "close" as const, closedAtLocal: "2026-01-01T13:00" };
    f.state.openVisits = 1;
    await expect(updateBusinessDayTimes(f.database, input, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
    f.state.openVisits = 0; f.state.activeTables = 1;
    await expect(updateBusinessDayTimes(f.database, input, context)).rejects.toBeInstanceOf(BusinessDayBlockedError);
    expect(f.state.days[0].closedAt).toBeNull();
  });
  it("rejects a changed snapshot, a second close, or the reuse of a request key", async () => {
    const f = fixture(); const input = { ...f.input, mode: "close" as const, closedAtLocal: "2026-01-01T13:00" };
    await updateBusinessDayTimes(f.database, input, context);
    await expect(updateBusinessDayTimes(f.database, input, context)).resolves.toEqual({ replayed: true, unchanged: false });
    await expect(updateBusinessDayTimes(f.database, { ...input, requestKey: randomUUID() }, context)).rejects.toBeInstanceOf(BusinessDayTimeChangedError);
    await expect(updateBusinessDayTimes(f.database, { ...input, reason: "different" }, context)).rejects.toBeInstanceOf(BusinessDayTimeChangedError);
    f.state.role = "STAFF";
    await expect(updateBusinessDayTimes(f.database, input, context)).rejects.toBeInstanceOf(BusinessDayTimePermissionError);
    expect(f.state.audits).toHaveLength(1);
  });
  it("blocks stale start-time edits after another manager saves", async () => {
    const f = fixture();
    await updateBusinessDayTimes(f.database, f.input, context);
    await expect(updateBusinessDayTimes(f.database, { ...f.input, requestKey: randomUUID(), openedAtLocal: "2026-01-01T07:00" }, context)).rejects.toBeInstanceOf(BusinessDayTimeChangedError);
  });
  it("changes closed times without reopening or replacing the original closing staff", async () => {
    const f = fixture(true);
    await updateBusinessDayTimes(f.database, { ...f.input, closedAtLocal: "2026-01-01T14:00" }, context);
    expect(f.state.days[0]).toMatchObject({ closedAt: at(5), closedByStaffId: "original-closer" });
    const g = fixture(true);
    await expect(updateBusinessDayTimes(g.database, { ...g.input, closedAtLocal: "" }, context)).rejects.toBeInstanceOf(BusinessDayTimeValidationError);
    const h = fixture();
    await expect(updateBusinessDayTimes(h.database, { ...h.input, closedAtLocal: "2026-01-01T14:00" }, context)).rejects.toBeInstanceOf(BusinessDayTimeValidationError);
  });
  it("rejects future dates and end before start", async () => {
    const f = fixture(true);
    for (const input of [{ ...f.input, openedAtLocal: "2099-01-01T09:00" }, { ...f.input, closedAtLocal: "2099-01-01T09:00" }, { ...f.input, closedAtLocal: "2026-01-01T07:00" }]) {
      await expect(updateBusinessDayTimes(f.database, input, context)).rejects.toBeInstanceOf(BusinessDayTimeValidationError);
    }
    expect(f.state.audits).toHaveLength(0);
  });
  it("keeps all visit, table and effective game times inside the day", async () => {
    const f = fixture(true);
    await expect(updateBusinessDayTimes(f.database, { ...f.input, openedAtLocal: "2026-01-01T10:01" }, context)).rejects.toThrow("記録より後");
    await expect(updateBusinessDayTimes(f.database, { ...f.input, closedAtLocal: "2026-01-01T11:00" }, context)).rejects.toThrow("記録より前");
    f.state.games._max.effectiveAt = at(5);
    await expect(updateBusinessDayTimes(f.database, f.input, context)).rejects.toThrow("記録より前");
    f.state.games._max.effectiveAt = at(2);
    await updateBusinessDayTimes(f.database, f.input, context);
    expect(f.tx.game.aggregate).toHaveBeenLastCalledWith(expect.objectContaining({ _max: { effectiveAt: true }, where: expect.objectContaining({ status: { in: ["CONFIRMED", "CORRECTED"] } }) }));
  });
  it("prevents overlaps and allows adjacent business days", async () => {
    const f = fixture(true);
    f.state.days.push({ ...structuredClone(f.state.days[0]), id: "previous", openedAt: new Date("2025-12-31T10:00Z"), closedAt: new Date("2025-12-31T23:30Z") });
    await expect(updateBusinessDayTimes(f.database, f.input, context)).rejects.toThrow("時間が重なります");
    f.input.openedAtLocal = "2026-01-01T08:30";
    await updateBusinessDayTimes(f.database, f.input, context);
    expect(f.state.days[0].openedAt.toISOString()).toBe("2025-12-31T23:30:00.000Z");
  });
  it("leaves unedited seconds/milliseconds intact and does not create empty history", async () => {
    const f = fixture(true);
    const input = { ...f.input, openedAtLocal: businessLocalDateTime(f.state.days[0].openedAt, "Asia/Tokyo") };
    await expect(updateBusinessDayTimes(f.database, input, context)).resolves.toEqual({ replayed: false, unchanged: true });
    expect(f.state.days[0].closedAt?.toISOString()).toBe(f.input.expectedClosedAt);
    expect(f.state.audits).toHaveLength(0);
  });
  it("rolls back all time changes when the audit fails", async () => {
    const f = fixture(); const before = structuredClone(f.state);
    f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(updateBusinessDayTimes(f.database, f.input, context)).rejects.toThrow("audit failed");
    expect(f.state).toEqual(before);
  });
});
