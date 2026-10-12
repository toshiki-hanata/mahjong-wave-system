import "server-only";

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readAdminSession } from "./session";
import { isSessionVersionCurrent, parseAdminSession } from "./session-data";
import { hasAnyRole } from "./authorization";

export type CurrentStaff = {
  id: string;
  storeId: string;
  name: string;
  storeName: string;
  storeTimezone: string;
  role: Role;
};

export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const session = await readAdminSession();
  if (!session) return null;

  const parsed = parseAdminSession({
    staffId: session.staffId,
    storeId: session.storeId,
    role: session.role,
    sessionVersion: session.sessionVersion,
  });
  if (!parsed.success || !prisma) return null;

  const staff = await prisma.staff.findFirst({
    where: { id: parsed.data.staffId, storeId: parsed.data.storeId },
    select: {
      id: true,
      storeId: true,
      name: true,
      role: true,
      isActive: true,
      sessionVersion: true,
      store: { select: { isActive: true, name: true, timezone: true } },
    },
  });

  if (!staff || !staff.isActive || !staff.store.isActive || staff.role !== parsed.data.role || !isSessionVersionCurrent(parsed.data.sessionVersion, staff.sessionVersion)) return null;
  return { id: staff.id, storeId: staff.storeId, name: staff.name, storeName: staff.store.name, storeTimezone: staff.store.timezone, role: staff.role };
}

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");
  return staff;
}

export async function requireRole(allowedRoles: readonly Role[]): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!hasAnyRole(staff.role, allowedRoles)) redirect("/admin?error=forbidden");
  return staff;
}
