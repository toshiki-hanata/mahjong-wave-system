import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { createTableSchema, startTableSessionSchema } from "./table-schemas";
import { tableManagementRoles, tableOperationRoles } from "./table-permissions";
import { hasAnyRole } from "@/lib/auth/authorization";

describe("table management validation and permissions", () => {
  it("requires four distinct Visits and every physical position exactly once", () => {
    const valid = { tableId: "t1", seats: [1, 2, 3, 4].map((position) => ({ position, visitId: `v${position}` })) };
    expect(startTableSessionSchema.safeParse(valid).success).toBe(true);
    expect(startTableSessionSchema.safeParse({ ...valid, seats: valid.seats.slice(0, 3) }).success).toBe(false);
    expect(startTableSessionSchema.safeParse({ ...valid, seats: [...valid.seats, { position: 5, visitId: "v5" }] }).success).toBe(false);
    expect(startTableSessionSchema.safeParse({ ...valid, seats: valid.seats.map((seat, i) => i === 3 ? { ...seat, visitId: "v1" } : seat) }).success).toBe(false);
    expect(startTableSessionSchema.safeParse({ ...valid, seats: valid.seats.map((seat, i) => i === 3 ? { ...seat, position: 3 } : seat) }).success).toBe(false);
  });

  it("validates store-local table names and order", () => {
    expect(createTableSchema.safeParse({ name: "A卓", sortOrder: 10 }).success).toBe(true);
    expect(createTableSchema.safeParse({ name: " ", sortOrder: -1 }).success).toBe(false);
  });

  it("allows all staff to operate tables but reserves table master management for OWNER/MANAGER", () => {
    expect(tableOperationRoles).toEqual([Role.OWNER, Role.MANAGER, Role.STAFF]);
    expect(tableManagementRoles).toEqual([Role.OWNER, Role.MANAGER]);
    expect(tableManagementRoles).not.toContain(Role.STAFF);
    expect(hasAnyRole(Role.STAFF, tableOperationRoles)).toBe(true);
    expect(hasAnyRole(Role.STAFF, tableManagementRoles)).toBe(false);
    expect(hasAnyRole(Role.MANAGER, tableManagementRoles)).toBe(true);
  });
});
