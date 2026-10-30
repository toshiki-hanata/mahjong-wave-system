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
import { quickReceptionSchema } from "@/features/visits/reception-schemas";
import { registerAndCheckIn, ReceptionNameExistsError, ReceptionRequestConflictError, type ReceptionCandidate } from "@/features/visits/reception-service";
import { BusinessDayClosedError, BusinessDayNotFoundError } from "@/features/business-days/business-day-service";

export type VisitActionState = { message?: string; success?: boolean };
export type QuickReceptionState = VisitActionState & {
  fieldError?: string;
  candidates?: ReceptionCandidate[];
  submittedName?: string;
  customer?: { internalName: string; customerCode: string };
};

export async function quickReceptionAction(_previous: QuickReceptionState, formData: FormData): Promise<QuickReceptionState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = quickReceptionSchema.safeParse({
    requestId: formData.get("requestId"), internalName: formData.get("internalName"),
    confirmDifferentPerson: formData.get("confirmDifferentPerson") === "on",
  });
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  if (!prisma) return { message: "データベースへ接続できません。入力を残したまま、時間をおいてお試しください。" };
  try {
    const customer = await registerAndCheckIn(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    revalidatePath("/admin/visits");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/tables");
    revalidatePath("/admin");
    return {
      success: true, customer: { internalName: customer.internalName, customerCode: customer.customerCode },
      message: customer.replayed ? "この登録は処理済みです。来店中一覧を確認してください。" : "登録と来店受付が完了しました。",
    };
  } catch (error) {
    if (error instanceof BusinessDayClosedError || error instanceof BusinessDayNotFoundError) return { message: "先に「営業開始・終了」画面から営業を開始してください。" };
    if (error instanceof ReceptionNameExistsError) return { message: error.message, candidates: error.candidates, submittedName: parsed.data.internalName };
    if (error instanceof ReceptionRequestConflictError) return { message: "この受付は処理済みです。画面を再読み込みして、来店中一覧を確認してください。" };
    if (error instanceof VisitCustomerUnavailableError) return { message: "店舗の有効状態を確認できません。管理者に確認してください。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
      return { message: "受付を保存できませんでした。入力を残したまま、時間をおいてお試しください。" };
    }
    throw error;
  }
}

export async function checkInVisitAction(_previous: VisitActionState, formData: FormData): Promise<VisitActionState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = checkInVisitSchema.safeParse({ customerId: formData.get("customerId") });
  if (!parsed.success) return { message: "有効な顧客を選択してください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };

  try {
    await checkInVisit(prisma, parsed.data.customerId, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) {
    if (error instanceof BusinessDayClosedError || error instanceof BusinessDayNotFoundError) return { message: "先に「営業開始・終了」画面から営業を開始してください。" };
    if (error instanceof DuplicateOpenVisitError) return { message: "この顧客はすでに来店中です。" };
    if (error instanceof VisitCustomerUnavailableError) return { message: "有効な自店舗の顧客を確認できません。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { message: "受付を保存できませんでした。再読み込みしてお試しください。" };
    throw error;
  }

  revalidatePath("/admin/visits");
  revalidatePath("/admin/tables");
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
  revalidatePath("/admin/tables");
  revalidatePath("/admin");
  redirect("/admin/visits?notice=checked-out");
}
