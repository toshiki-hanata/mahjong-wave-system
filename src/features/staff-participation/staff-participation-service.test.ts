import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkInStaffParticipant, StaffParticipantUnavailableError, StaffParticipationConflictError } from "./staff-participation-service";
import { BusinessDayClosedError } from "@/features/business-days/business-day-service";
import { checkInVisit, VisitCustomerUnavailableError } from "@/features/visits/visit-service";

const context = { storeId: "store-a", staffId: "owner-a" };
function flatten(values: unknown[]): unknown[] {
  return values.flatMap((value) => value && typeof value === "object" && "values" in value && Array.isArray(value.values) ? flatten(value.values) : [value]);
}
function fixture() {
  const state = {
    open: true,
    staff: [{ id: "owner-a", storeId: "store-a", name: "責任者", isActive: true }, { id: "staff-a", storeId: "store-a", name: "同じ名前", isActive: true }, { id: "staff-b", storeId: "store-b", name: "別店舗", isActive: true }],
    profiles: [] as Array<{ id: string; storeId: string; participantStaffId: string | null; internalName: string; isActive: boolean; firstVisitAt: Date | null; lastVisitAt: Date | null }>,
    visits: [] as Array<{ id: string; storeId: string; customerId: string; businessDayId: string; status: string }>,
    audits: [] as Array<{ action: string; metadata: Record<string, unknown> }>,
  };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...raw: unknown[]) => {
      const sql = strings.join(""), values = flatten(raw);
      if (sql.includes('FROM "Store"')) return values[0] === context.storeId ? [{ id: context.storeId, timezone: "Asia/Tokyo", freeGamePriceYen: 2500 }] : [];
      if (sql.includes('FROM "Staff"')) return state.staff.filter((staff) => staff.storeId === values[0] && values.includes(staff.id));
      if (sql.includes('FROM "Customer"')) return state.profiles.filter((profile) => profile.id === values[0] && profile.storeId === values[1] && profile.isActive);
      throw new Error("Unexpected query");
    }),
    businessDay: { findFirst: vi.fn(async () => state.open ? { id: "day-a" } : null) },
    customer: {
      findFirst: vi.fn(async ({ where }: { where: { storeId: string; participantStaffId: string } }) => state.profiles.find((profile) => profile.storeId === where.storeId && profile.participantStaffId === where.participantStaffId) ?? null),
      create: vi.fn(async ({ data }: { data: { id: string; storeId: string; internalName: string; participantStaffId: string } }) => {
        const profile = { ...data, isActive: true, firstVisitAt: null, lastVisitAt: null }; state.profiles.push(profile); return profile;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(state.profiles.find((profile) => profile.id === where.id)!, data)),
    },
    visit: {
      findFirst: vi.fn(async ({ where }: { where: { storeId: string; customerId: string } }) => state.visits.find((visit) => visit.storeId === where.storeId && visit.customerId === where.customerId && visit.status !== "CHECKED_OUT") ?? null),
      create: vi.fn(async ({ data }: { data: { storeId: string; customerId: string; businessDayId: string; status: string } }) => { const visit = { ...data, id: `visit-${state.visits.length + 1}` }; state.visits.push(visit); return visit; }),
    },
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { metadata: { equals: string } } }) => state.audits.find((audit) => audit.action === "STAFF_PARTICIPATION_CHECK_IN" && audit.metadata.requestKey === where.metadata.equals) ?? null),
      create: vi.fn(async ({ data }: { data: { action: string; metadata: Record<string, unknown> } }) => { state.audits.push(data); }),
    },
  };
  const database = { $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    const before = structuredClone(state);
    try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, tx, database, input: { participantStaffId: "staff-a", requestKey: randomUUID() } };
}

describe("Staff participation check-in", () => {
  it("creates a dedicated participant without merging a same-name customer", async () => {
    const f = fixture();
    f.state.profiles.push({ id: "ordinary", storeId: "store-a", internalName: "同じ名前", participantStaffId: null, isActive: true, firstVisitAt: null, lastVisitAt: null });
    await checkInStaffParticipant(f.database, f.input, context);
    expect(f.state.profiles).toHaveLength(2);
    expect(f.state.visits[0]).toMatchObject({ customerId: "staff-player-staff-a", businessDayId: "day-a", status: "WAITING" });
    expect(f.state.profiles[0].participantStaffId).toBeNull();
    expect(f.state.audits.filter((audit) => audit.action === "STAFF_PARTICIPATION_CHECK_IN")).toHaveLength(1);
  });
  it("replays a key even after checkout and never reopens attendance with that key", async () => {
    const f = fixture();
    const result = await checkInStaffParticipant(f.database, f.input, context);
    await expect(checkInStaffParticipant(f.database, f.input, context)).resolves.toEqual({ visitId: result.visitId, replayed: true });
    const duplicate = { ...f.input, requestKey: randomUUID() };
    await checkInStaffParticipant(f.database, duplicate, context);
    f.state.visits[0].status = "CHECKED_OUT"; f.state.open = false;
    await expect(checkInStaffParticipant(f.database, duplicate, context)).resolves.toEqual({ visitId: result.visitId, replayed: true });
    expect(f.state.visits).toHaveLength(1);
    f.state.open = true;
    await checkInStaffParticipant(f.database, { ...f.input, requestKey: randomUUID() }, context);
    expect(f.state.profiles).toHaveLength(1); expect(f.state.visits).toHaveLength(2);
  });
  it("rejects a used key with a different staff target", async () => {
    const f = fixture(); await checkInStaffParticipant(f.database, f.input, context);
    await expect(checkInStaffParticipant(f.database, { ...f.input, participantStaffId: context.staffId }, context)).rejects.toBeInstanceOf(StaffParticipationConflictError);
    expect(f.state.visits).toHaveLength(1);
  });
  it("blocks inactive staff, other-store staff, and an invalid actor", async () => {
    const f = fixture();
    await expect(checkInStaffParticipant(f.database, { ...f.input, participantStaffId: "staff-b" }, context)).rejects.toBeInstanceOf(StaffParticipantUnavailableError);
    await expect(checkInStaffParticipant(f.database, f.input, { ...context, staffId: "staff-b" })).rejects.toBeInstanceOf(StaffParticipantUnavailableError);
    f.state.staff[1].isActive = false;
    await expect(checkInStaffParticipant(f.database, f.input, context)).rejects.toBeInstanceOf(StaffParticipantUnavailableError);
    expect(f.state.visits).toHaveLength(0);
  });
  it("requires an open day and rolls back all profile/visit changes if auditing fails", async () => {
    const f = fixture(); f.state.open = false;
    await expect(checkInStaffParticipant(f.database, f.input, context)).rejects.toBeInstanceOf(BusinessDayClosedError);
    f.state.open = true;
    f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(checkInStaffParticipant(f.database, f.input, context)).rejects.toThrow("audit failed");
    expect(f.state.profiles).toHaveLength(0); expect(f.state.visits).toHaveLength(0);
  });
  it("blocks access to a staff participant through the ordinary customer check-in path", async () => {
    const f = fixture(); await checkInStaffParticipant(f.database, f.input, context);
    await expect(checkInVisit(f.database, f.state.profiles[0].id, context)).rejects.toBeInstanceOf(VisitCustomerUnavailableError);
    expect(f.state.visits).toHaveLength(1);
  });
});
