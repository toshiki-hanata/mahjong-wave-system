"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rankingSettingsSchema, updateRankingSettings } from "@/features/rankings/ranking-settings";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export async function updateRankingSettingsAction(formData: FormData): Promise<void> {
  const staff = await requireRole([Role.OWNER, Role.MANAGER]);
  const parsed = rankingSettingsSchema.safeParse({
    monthlyMinimumGames: formData.get("monthlyMinimumGames"),
    annualMinimumGames: formData.get("annualMinimumGames"),
    lifetimeMinimumGames: formData.get("lifetimeMinimumGames"),
  });
  if (!parsed.success || !prisma) redirect("/admin/rankings/settings?error=invalid");
  await updateRankingSettings(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
  revalidatePath("/admin/rankings");
  revalidatePath("/admin/rankings/settings");
  revalidatePath("/admin/customers");
  redirect("/admin/rankings/settings?saved=1");
}
