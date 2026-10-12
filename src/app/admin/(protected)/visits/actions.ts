"use server";

import { Prisma, VisitStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import {
  checkInVisit,
  checkOutVisit,
  DuplicateOpenVisitError,
  InvalidVisitTransitionError,
  VisitCustomerUnavailableError,
} from "@/features/visits/visit-service";
import { checkInVisitSchema, visitIdSchema } from "@/features/visits/visit-schemas";
import { visitOperationRoles } from "@/features/visits/visit-permissions";

export type VisitActionState = { message?: string; success?: boolean };

export async function checkInVisitAction(_previous: VisitActionState, formData: FormData): Promise<VisitActionState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = checkInVisitSchema.safeParse({ customerId: formData.get("customerId") });
  if (!parsed.success) return { message: "有効な顧客を選択してください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };

  try {
    await checkInVisit(prisma, parsed.data.customerId, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) {
    if (error instanceof DuplicateOpenVisitError) return { message: "この顧客はすでに来店中です。" };
    if (error instanceof VisitCustomerUnavailableError) return { message: "有効な自店舗の顧客を確認できません。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { message: "受付を保存できませんでした。再読み込みしてお試しください。" };
    throw error;
  }

  revalidatePath("/admin/visits");
  revalidatePath("/admin");
  return { success: true, message: "来店を受け付けました。" };
}

export async function checkOutVisitAction(_previous: VisitActionState, formData: FormData): Promise<VisitActionState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = visitIdSchema.safeParse({ visitId: formData.get("visitId") });
  if (!parsed.success) return { message: "来店情報を確認できません。" };
  if (!prisma) return { message: "データベースへ接続できません。" };

  try {
    const checkedOut = await checkOutVisit(prisma, parsed.data.visitId, { storeId: staff.storeId, staffId: staff.id });
    if (!checkedOut) return { message: "来店情報が見つかりません。" };
  } catch (error) {
    if (error instanceof InvalidVisitTransitionError) {
      const visit = await prisma.visit.findFirst({
        where: { id: parsed.data.visitId, storeId: staff.storeId },
        select: { status: true },
      });
      return { message: visit?.status === VisitStatus.PLAYING ? "対局中の顧客は卓から外してから退店処理してください。" : "この来店はすでに退店済みです。" };
    }
    throw error;
  }

  revalidatePath("/admin/visits");
  revalidatePath("/admin");
  redirect("/admin/visits?notice=checked-out");
}
