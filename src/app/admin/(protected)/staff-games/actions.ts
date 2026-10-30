"use server";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";
import { BusinessDayClosedError, BusinessDayNotFoundError } from "@/features/business-days/business-day-service";
import { checkInStaffParticipant, StaffParticipantUnavailableError, StaffParticipationConflictError, staffParticipationInputSchema } from "@/features/staff-participation/staff-participation-service";

export type StaffParticipationState = { message?: string };
export async function checkInStaffParticipantAction(_previous: StaffParticipationState, formData: FormData): Promise<StaffParticipationState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = staffParticipationInputSchema.safeParse({ participantStaffId: formData.get("participantStaffId"), requestKey: formData.get("requestKey") });
  if (!parsed.success) return { message: "参加するスタッフを選択してください。画面を更新して再度お試しください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try {
    await checkInStaffParticipant(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) {
    if (error instanceof BusinessDayClosedError || error instanceof BusinessDayNotFoundError) return { message: "営業を開始してからスタッフを参加させてください。" };
    if (error instanceof StaffParticipantUnavailableError) return { message: "自店舗の有効なスタッフを選択してください。" };
    if (error instanceof StaffParticipationConflictError) return { message: "この送信は別の内容で処理済みか、営業が変わっています。画面を更新してください。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) return { message: "保存できませんでした。現在の参加状況を確認してからお試しください。" };
    throw error;
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/visits?notice=staff-joined");
}
