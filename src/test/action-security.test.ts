import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  signedIn: true,
  role: "STAFF" as "OWNER" | "MANAGER" | "STAFF",
  unauthenticated: new Error("AUTHENTICATION_REQUIRED"),
  forbidden: new Error("ROLE_FORBIDDEN"),
  databaseAccess: vi.fn(() => { throw new Error("UNEXPECTED_DATABASE_ACCESS"); }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get() { return boundary.databaseAccess(); } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("UNEXPECTED_REDIRECT"); }) }));
vi.mock("@/lib/auth/current-staff", () => {
  async function requireStaff() {
    if (!boundary.signedIn) throw boundary.unauthenticated;
    return { id: "staff-a", storeId: "store-a", role: boundary.role };
  }
  return {
    requireStaff,
    requireRole: async (roles: readonly string[]) => {
      const staff = await requireStaff();
      if (!roles.includes(staff.role)) throw boundary.forbidden;
      return staff;
    },
  };
});

import { openBusinessDayAction, closeBusinessDayAction, updateBusinessDayTimesAction, updateFreeGamePriceAction } from "@/app/admin/(protected)/business-days/actions";
import { createTableAction, updateTableAction, deactivateTableAction, startTableSessionAction, endTableSessionAction, changeTableMembersAction } from "@/app/admin/(protected)/tables/actions";
import { createGameAction, correctGameAction, createStoreRuleAction } from "@/app/admin/(protected)/games/actions";
import { quickReceptionAction, checkInVisitAction, checkOutVisitAction } from "@/app/admin/(protected)/visits/actions";
import { checkInStaffParticipantAction } from "@/app/admin/(protected)/staff-games/actions";

const allActions = [
  ["staff participation", checkInStaffParticipantAction],
  ["open business", openBusinessDayAction], ["close business", closeBusinessDayAction],
  ["edit business times", updateBusinessDayTimesAction], ["change price", updateFreeGamePriceAction],
  ["create table", createTableAction], ["edit table", updateTableAction], ["deactivate table", deactivateTableAction],
  ["start table", startTableSessionAction], ["end table", endTableSessionAction], ["change members", changeTableMembersAction],
  ["save game", createGameAction], ["correct game", correctGameAction], ["edit rules", createStoreRuleAction],
  ["register and check in", quickReceptionAction], ["check in", checkInVisitAction], ["check out", checkOutVisitAction],
] as const;
const privilegedActions = [
  ["edit business times", updateBusinessDayTimesAction], ["change price", updateFreeGamePriceAction],
  ["create table", createTableAction], ["edit table", updateTableAction], ["deactivate table", deactivateTableAction],
  ["correct game", correctGameAction], ["edit rules", createStoreRuleAction],
] as const;

function forgedForm() {
  const form = new FormData();
  form.set("role", "OWNER");
  form.set("storeId", "other-store");
  form.set("staffId", "other-owner");
  form.set("confirmed", "on");
  return form;
}

beforeEach(() => {
  boundary.signedIn = true;
  boundary.role = "STAFF";
  boundary.databaseAccess.mockClear();
});

describe("Server Action authorization boundaries", () => {
  it.each(allActions)("rejects unauthenticated direct calls to %s before accessing data", async (_name, action) => {
    boundary.signedIn = false;
    await expect(action({}, forgedForm())).rejects.toBe(boundary.unauthenticated);
    expect(boundary.databaseAccess).not.toHaveBeenCalled();
  });
  it.each(privilegedActions)("rejects staff forging OWNER fields for %s before accessing data", async (_name, action) => {
    await expect(action({}, forgedForm())).rejects.toBe(boundary.forbidden);
    expect(boundary.databaseAccess).not.toHaveBeenCalled();
  });
});
