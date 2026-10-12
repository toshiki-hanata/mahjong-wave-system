"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { revokeStaffSessions } from "@/lib/auth/staff-security-service";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export async function revokeStaffSessionsAction(formData: FormData): Promise<never> {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const parsed = z.string().trim().min(1).max(100).safeParse(formData.get("staffId"));
  if (!parsed.success || !prisma) redirect("/admin/staff-sessions?error=invalid");
  if (parsed.data === actor.id) redirect("/admin/staff-sessions?error=self");
  const target = await prisma.staff.findFirst({ where: { id: parsed.data, storeId: actor.storeId }, select: { role: true } });
  if (!target || (actor.role === "MANAGER" && target.role === "OWNER")) redirect("/admin/staff-sessions?error=not-found");
  const revoked = await revokeStaffSessions(prisma, parsed.data, { storeId: actor.storeId, actorStaffId: actor.id });
  if (!revoked) redirect("/admin/staff-sessions?error=not-found");
  revalidatePath("/admin/staff-sessions");
  redirect("/admin/staff-sessions?revoked=1");
}
