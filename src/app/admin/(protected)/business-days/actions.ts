"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireRole, requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { BusinessDayBlockedError, BusinessDayNotFoundError, closeBusinessDay, openBusinessDay, updateFreeGamePrice } from "@/features/business-days/business-day-service";
import { businessDayTimeInputSchema, BusinessDayTimeValidationError } from "@/features/business-days/business-day-time";
import { updateBusinessDayTimes } from "@/features/business-days/business-day-time-service";

export type BusinessDayActionState = { success?: boolean; message?: string };

function refreshBusinessPages() {
  revalidatePath("/admin", "layout");
}

function errorState(error: unknown): BusinessDayActionState {
  if (error instanceof BusinessDayTimeValidationError) return { message: error.message };
  if (error instanceof BusinessDayBlockedError) return { message: error.message };
  if (error instanceof BusinessDayNotFoundError) return { message: "営業情報を確認できません。画面を更新してください。" };
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) return { message: "処理できませんでした。最新の営業状態を確認してからお試しください。" };
  throw error;
}

export async function updateBusinessDayTimesAction(_previous: BusinessDayActionState, formData: FormData): Promise<BusinessDayActionState> {
  const staff = await requireRole(["OWNER", "MANAGER"]);
  const parsed = businessDayTimeInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (!prisma) return { message: "データベースへ接続できません。" };
  if (formData.get("confirmed") !== "on") return { message: "記録内容を確認して確認欄を選択してください。" };
  try {
    const result = await updateBusinessDayTimes(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    refreshBusinessPages();
    return { success: true, message: result.replayed ? "この操作は保存済みです。最新の営業情報を確認してください。" : result.unchanged ? "時刻の変更はありません。" : parsed.data.mode === "close" ? "指定した日時で営業を終了し、理由を履歴に残しました。" : "営業日時を訂正し、変更内容を履歴に残しました。" };
  } catch (error) { return errorState(error); }
}

export async function openBusinessDayAction(_previous: BusinessDayActionState, formData: FormData): Promise<BusinessDayActionState> {
  const staff = await requireStaff();
  const key = z.uuid().safeParse(formData.get("requestKey"));
  if (!key.success || !prisma) return { message: "営業開始の情報を確認できません。画面を更新してください。" };
  try {
    const result = await openBusinessDay(prisma, key.data, { storeId: staff.storeId, staffId: staff.id });
    refreshBusinessPages();
    return { success: true, message: result.replayed ? "営業開始は処理済みです。現在の状態を確認してください。" : "営業を開始しました。来店受付へ進んでください。" };
  } catch (error) { return errorState(error); }
}

export async function closeBusinessDayAction(_previous: BusinessDayActionState, formData: FormData): Promise<BusinessDayActionState> {
  const staff = await requireStaff();
  const id = z.string().min(1).max(200).safeParse(formData.get("businessDayId"));
  if (!id.success || !prisma) return { message: "営業情報を確認できません。画面を更新してください。" };
  if (formData.get("confirmed") !== "on") return { message: "本数・売上と退店状況の確認欄を選択してください。" };
  try {
    const result = await closeBusinessDay(prisma, id.data, { storeId: staff.storeId, staffId: staff.id });
    refreshBusinessPages();
    return { success: true, message: result.replayed ? "この営業は終了済みです。" : "営業を終了しました。お疲れさまでした。" };
  } catch (error) { return errorState(error); }
}

export async function updateFreeGamePriceAction(_previous: BusinessDayActionState, formData: FormData): Promise<BusinessDayActionState> {
  const staff = await requireRole(["OWNER", "MANAGER"]);
  const price = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1_000_000)).safeParse(formData.get("priceYen"));
  if (!price.success || !prisma) return { message: "料金は0〜1,000,000円の整数で入力してください。" };
  try {
    await updateFreeGamePrice(prisma, price.data, { storeId: staff.storeId, staffId: staff.id });
    refreshBusinessPages();
    return { success: true, message: "次の営業開始から適用します。営業中・過去の料金は変わりません。" };
  } catch (error) { return errorState(error); }
}
