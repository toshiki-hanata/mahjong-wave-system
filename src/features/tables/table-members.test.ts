import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { changeTableMembers, TableMemberUnavailableError, TableMembersChangedError } from "./table-members-service";
import { seatingToken } from "./seat-snapshot";
import { changeTableMembersSchema } from "./table-schemas";

vi.mock("@/features/business-days/business-day-service", () => ({ lockBusinessStore: vi.fn(), requireOpenBusinessDay: vi.fn(async () => ({ id: "day-a" })) }));
const context = { storeId: "store-a", staffId: "staff-a" };

function fixture() {
  const state = {
    seats: [1, 2, 3, 4].map((position) => ({ id: `seat-${position}`, visitId: `visit-${position}`, position, removedAt: null as Date | null })),
    visits: [1, 2, 3, 4, 5].map((i) => ({ id: `visit-${i}`, status: i < 5 ? "PLAYING" : "WAITING", businessDayId: "day-a", customerIsActive: true })),
    audits: [] as Array<{ metadata: { requestKey: string; requestPayload: string } }>,
    sequence: 1,
  };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes('FROM "TableSession"')) return values[1] === context.storeId ? [{ id: "session-a", businessDayId: "day-a", status: "ACTIVE" }] : [];
      return state.visits;
    }),
    tableSeat: {
      findMany: vi.fn(async () => state.seats.filter((seat) => !seat.removedAt)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string | { in: string[] } }; data: { removedAt: Date } }) => {
        const ids = typeof where.id === "string" ? [where.id] : where.id.in;
        const rows = state.seats.filter((seat) => !seat.removedAt && ids.includes(seat.id));
        rows.forEach((seat) => { seat.removedAt = data.removedAt; });
        return { count: rows.length };
      }),
      create: vi.fn(async ({ data }: { data: { position: number; visitId: string } }) => {
        state.seats.push({ id: `seat-new-${state.seats.length}`, position: data.position, visitId: data.visitId, removedAt: null });
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ position: number; visitId: string }> }) => {
        for (const row of data) state.seats.push({ id: `seat-new-${state.seats.length}`, position: row.position, visitId: row.visitId, removedAt: null });
      }),
    },
    game: { aggregate: vi.fn(async () => ({ _max: { sequenceNumber: state.sequence } })) },
    visit: { updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
      const row = state.visits.find((visit) => visit.id === where.id && visit.status === where.status);
      if (!row) return { count: 0 }; row.status = data.status; return { count: 1 };
    }) },
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { metadata: { equals: string } } }) => state.audits.find((audit) => audit.metadata.requestKey === where.metadata.equals) ?? null),
      create: vi.fn(async ({ data }: { data: { metadata: { requestKey: string; requestPayload: string } } }) => { state.audits.push(data); }),
    },
  };
  const database = { $transaction: async <T>(fn: (transaction: unknown) => Promise<T>) => {
    const before = structuredClone(state); try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; }
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const input = { sessionId: "session-a", requestKey: "428a3d8d-0e15-40de-9899-0056d66743f4", seatingToken: seatingToken(state.seats), expectedSequence: 2, mode: "replace" as const, position: 1, incomingVisitId: "visit-5" };
  return { state, tx, database, input };
}

describe("Table member changes", () => {
  it("requires valid distinct seats and a complete request snapshot", () => {
    const f = fixture();
    expect(changeTableMembersSchema.safeParse(f.input).success).toBe(true);
    expect(changeTableMembersSchema.safeParse({ ...f.input, mode: "swap", otherPosition: 1 }).success).toBe(false);
    expect(changeTableMembersSchema.safeParse({ ...f.input, incomingVisitId: "" }).success).toBe(false);
    expect(changeTableMembersSchema.safeParse({ ...f.input, seatingToken: "stale" }).success).toBe(false);
  });
  it("replaces only one player and preserves historical seat rows", async () => {
    const f = fixture(); await changeTableMembers(f.database, f.input, context);
    expect(f.state.seats.filter((seat) => !seat.removedAt)).toHaveLength(4);
    expect(f.state.seats[0].removedAt).toBeInstanceOf(Date);
    expect(f.state.seats[4]).toMatchObject({ position: 1, visitId: "visit-5", removedAt: null });
    expect(f.state.visits[0].status).toBe("WAITING"); expect(f.state.visits[4].status).toBe("PLAYING");
    expect(f.state.visits.slice(1, 4).every((visit) => visit.status === "PLAYING")).toBe(true);
  });
  it("swaps two seats without checking either player out", async () => {
    const f = fixture(); await changeTableMembers(f.database, { ...f.input, mode: "swap", otherPosition: 2 }, context);
    const active = f.state.seats.filter((seat) => !seat.removedAt);
    expect(active.find((seat) => seat.position === 1)?.visitId).toBe("visit-2");
    expect(active.find((seat) => seat.position === 2)?.visitId).toBe("visit-1");
    expect(f.tx.visit.updateMany).not.toHaveBeenCalled();
  });
  it("invalidates old forms even if occupants return to the same positions", () => {
    const f = fixture();
    expect(seatingToken([...f.state.seats].reverse())).toBe(f.input.seatingToken);
    expect(seatingToken(f.state.seats.map((seat) => ({ ...seat, id: `${seat.id}-new` })))).not.toBe(f.input.seatingToken);
  });
  it("rejects a stale seat snapshot or a newly saved half-game", async () => {
    const f = fixture();
    await expect(changeTableMembers(f.database, { ...f.input, seatingToken: "a".repeat(64) }, context)).rejects.toBeInstanceOf(TableMembersChangedError);
    f.state.sequence = 2;
    await expect(changeTableMembers(f.database, f.input, context)).rejects.toBeInstanceOf(TableMembersChangedError);
    expect(f.state.audits).toHaveLength(0);
  });
  it("blocks another store, an occupied newcomer, or an inactive customer", async () => {
    const f = fixture();
    await expect(changeTableMembers(f.database, f.input, { ...context, storeId: "other" })).rejects.toBeInstanceOf(TableMembersChangedError);
    f.state.visits[4].status = "PLAYING";
    await expect(changeTableMembers(f.database, f.input, context)).rejects.toBeInstanceOf(TableMemberUnavailableError);
    f.state.visits[4].status = "WAITING"; f.state.visits[4].customerIsActive = false;
    await expect(changeTableMembers(f.database, f.input, context)).rejects.toBeInstanceOf(TableMemberUnavailableError);
  });
  it("replays the same request once and rejects changes to a used request", async () => {
    const f = fixture(); await changeTableMembers(f.database, f.input, context);
    await expect(changeTableMembers(f.database, f.input, context)).resolves.toEqual({ replayed: true });
    expect(f.state.audits).toHaveLength(1); expect(f.state.seats).toHaveLength(5);
    await expect(changeTableMembers(f.database, { ...f.input, position: 2 }, context)).rejects.toBeInstanceOf(TableMembersChangedError);
  });
  it("rolls back seats and visit transitions if the audit fails", async () => {
    const f = fixture(); const before = structuredClone(f.state);
    f.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));
    await expect(changeTableMembers(f.database, f.input, context)).rejects.toThrow("audit failed");
    expect(f.state).toEqual(before);
  });
});
