"use server";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { adjustPoints, reversePointAdjustment, pointAdjustmentSchema, pointReversalSchema, PointPermissionError, PointCustomerUnavailableError, PointConflictError, PointBalanceError } from "@/features/points/point-ledger-service";

export type PointFormState = { message?: string };
function message(error: unknown): PointFormState {
  if (error instanceof PointPermissionError) return { message: "ポイントの調整・取消は責任者が行ってください。" };
  if (error instanceof PointCustomerUnavailableError) return { message: "この会員にはポイントを記録できません。登録状態を確認してください。" };
  if (error instanceof PointConflictError) return { message: "残高や記録が変更されています。画面を更新し、現在の履歴を確認してください。" };
  if (error instanceof PointBalanceError) return { message: "残高不足または扱えるポイント数の上限を超えるため、記録できません。" };
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) return { message: "保存できませんでした。履歴を確認してからお試しください。" };
  throw error;
}
export async function adjustPointsAction(customerId: string, _previous: PointFormState, formData: FormData): Promise<PointFormState> {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const amount = Number(formData.get("amount")), direction = formData.get("direction");
  if (!Number.isInteger(amount) || amount <= 0 || (direction !== "add" && direction !== "subtract")) return { message: "追加・減算を選び、1以上の整数ポイントを入力してください。" };
  const parsed = pointAdjustmentSchema.safeParse({ customerId, requestKey: formData.get("requestKey"), expectedBalance: Number(formData.get("expectedBalance")), reason: formData.get("reason"), delta: direction === "add" ? amount : -amount });
  if (!parsed.success) return { message: "ポイント数と理由を確認してください。画面を更新して再度お試しください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try { await adjustPoints(prisma, parsed.data, { storeId: actor.storeId, staffId: actor.id }); } catch (error) { return message(error); }
  revalidatePath(`/admin/customers/${customerId}/points`);
  redirect(`/admin/customers/${encodeURIComponent(customerId)}/points?notice=adjusted`);
}
export async function reversePointsAction(customerId: string, _previous: PointFormState, formData: FormData): Promise<PointFormState> {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const parsed = pointReversalSchema.safeParse({ customerId, requestKey: formData.get("requestKey"), expectedBalance: Number(formData.get("expectedBalance")), reason: formData.get("reason"), entryId: formData.get("entryId") });
  if (!parsed.success) return { message: "取消理由を入力し、画面を更新して再度お試しください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try { await reversePointAdjustment(prisma, parsed.data, { storeId: actor.storeId, staffId: actor.id }); } catch (error) { return message(error); }
  revalidatePath(`/admin/customers/${customerId}/points`);
  redirect(`/admin/customers/${encodeURIComponent(customerId)}/points?notice=reversed`);
}
