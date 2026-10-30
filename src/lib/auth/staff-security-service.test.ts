import { describe, expect, it, vi } from "vitest";
import { changeStaffPassword, revokeStaffSessions, setStaffActive } from "./staff-security-service";

vi.mock("@/features/business-days/business-day-service", () => ({ lockBusinessStore: vi.fn() }));

describe("staff session revocation", () => {
  it("increments only a staff row scoped to the authenticated store and audits the revoke", async () => {
    const updateMany = vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { void args; return { count: 1 }; });
    const auditCreate = vi.fn(async () => ({}));
    const database = {
      $transaction: async (callback: (tx: unknown) => Promise<boolean>) => callback({ staff: { updateMany }, auditLog: { create: auditCreate } }),
    };
    await expect(revokeStaffSessions(database as never, "staff-2", { storeId: "store-a", actorStaffId: "staff-1" })).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "staff-2", storeId: "store-a" }, data: { sessionVersion: { increment: 1 } } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "STAFF_SESSION_REVOKE", entityId: "staff-2", metadata: { scope: "all-sessions" } }) }));
  });

  it("deactivates staff and increments the version in a store-scoped transaction", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const auditCreate = vi.fn(async () => ({}));
    const database = {
      $transaction: async (callback: (tx: unknown) => Promise<boolean>) => callback({
        staff: { findFirst: async () => ({ isActive: true }), updateMany },
        auditLog: { create: auditCreate },
      }),
    };
    await expect(setStaffActive(database as never, "staff-2", false, { storeId: "store-a", actorStaffId: "staff-1" })).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "staff-2", storeId: "store-a", isActive: true }, data: { isActive: false, sessionVersion: { increment: 1 } } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "STAFF_DEACTIVATE", metadata: { sessionsRevoked: true } }) }));
  });

  it("hashes a changed password, revokes prior sessions, and does not audit password data", async () => {
    const updateMany = vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { void args; return { count: 1 }; });
    const auditCreate = vi.fn(async () => ({}));
    const database = {
      $transaction: async (callback: (tx: unknown) => Promise<boolean>) => callback({ staff: { updateMany }, auditLog: { create: auditCreate } }),
    };
    await expect(changeStaffPassword(database as never, "staff-2", "a-strong-test-password", { storeId: "store-a", actorStaffId: "staff-1" })).resolves.toBe(true);
    const update = updateMany.mock.calls[0]?.[0];
    expect(update?.data.passwordHash).not.toBe("a-strong-test-password");
    expect(update?.data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(update?.data.sessionVersion).toEqual({ increment: 1 });
    expect(JSON.stringify(auditCreate.mock.calls[0])).not.toContain("a-strong-test-password");
  });
});
