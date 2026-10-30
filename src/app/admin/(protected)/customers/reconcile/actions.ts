"use server";
import { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { previewRoster, type RosterPreview } from "@/features/customers/roster-reconciliation-service";

export async function previewRosterAction(_previous: RosterPreview, formData: FormData): Promise<RosterPreview> {
  const staff = await requireStaff();
  if (!prisma) return { message: "名簿を照合できません。接続状態を確認してください。" };
  try {
    return await previewRoster(prisma, staff.storeId, formData.get("roster"));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) return { message: "名簿を照合できませんでした。時間をおいてお試しください。" };
    throw error;
  }
}
