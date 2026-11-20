"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { requireStaffActionPermit } from "@/lib/auth/staff-action-permit";
import { logSecurityEvent } from "@/lib/security/security-log";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";
import { qrReceptionEnabled, reviewSchema } from "@/features/qr-reception/policy";
import { updateReceptionSetting, approveReceptionRequest, rejectReceptionRequest, QrReceptionError } from "@/features/qr-reception/service";
import { BusinessDayClosedError, BusinessDayNotFoundError } from "@/features/business-days/business-day-service";

export type QrStaffFormState = { message?: string };
function message(error: unknown): QrStaffFormState {
  if (error instanceof QrReceptionError) return { message: error.message };
  if (error instanceof BusinessDayClosedError || error instanceof BusinessDayNotFoundError) return { message: "現在の営業日と店舗の状態を確認してください。" };
  logSecurityEvent("REQUEST_ERROR", "error"); return { message: "処理できませんでした。最新の状態を確認して再度お試しください。" };
}
export async function updateQrReceptionAction(_previous: QrStaffFormState, form: FormData): Promise<QrStaffFormState> {
  const staff = await requireRole(visitOperationRoles);
  const mode = form.get("mode");
  if (!qrReceptionEnabled() || !prisma || (mode !== "enable" && mode !== "disable" && mode !== "rotate")) return { message: "QR受付の設定を確認してください。" };
  await requireStaffActionPermit(staff);
  try { await updateReceptionSetting(prisma, mode, { storeId: staff.storeId, staffId: staff.id, sessionVersion: staff.sessionVersion }); } catch (error) { return message(error); }
  revalidatePath("/admin/reception-qr"); revalidatePath(`/reception/${staff.storeId}`);
  return { message: mode === "disable" ? "QR受付を停止しました。以前のQRは使えません。" : "QR受付を有効にしました。表示中のQRを店内に掲示してください。" };
}
export async function approveQrReceptionAction(_previous: QrStaffFormState, form: FormData): Promise<QrStaffFormState> {
  const staff = await requireRole(visitOperationRoles);
  const parsed = reviewSchema.safeParse({ requestId: form.get("requestId"), mode: form.get("mode"), customerId: form.get("customerId"), newName: form.get("newName") ?? "", personConfirmed: form.get("personConfirmed") === "on", differentPersonConfirmed: form.get("differentPersonConfirmed") === "on" });
  if (!qrReceptionEnabled() || !prisma || !parsed.success) return { message: "会員を選び、店内の本人と受付番号を確認してください。" };
  await requireStaffActionPermit(staff);
  try { await approveReceptionRequest(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id, sessionVersion: staff.sessionVersion }); } catch (error) { return message(error); }
  revalidatePath("/admin/reception-qr"); revalidatePath("/admin/visits"); revalidatePath("/admin/tables"); revalidatePath("/admin"); revalidatePath(`/reception/${staff.storeId}`);
  redirect("/admin/reception-qr?notice=approved");
}
export async function rejectQrReceptionAction(_previous: QrStaffFormState, form: FormData): Promise<QrStaffFormState> {
  const staff = await requireRole(visitOperationRoles), id = form.get("requestId");
  if (!qrReceptionEnabled() || !prisma || typeof id !== "string" || !id || id.length > 200) return { message: "受付申請を確認してください。" };
  await requireStaffActionPermit(staff);
  try { await rejectReceptionRequest(prisma, id, { storeId: staff.storeId, staffId: staff.id, sessionVersion: staff.sessionVersion }); } catch (error) { return message(error); }
  revalidatePath("/admin/reception-qr"); revalidatePath(`/reception/${staff.storeId}`);
  redirect("/admin/reception-qr?notice=rejected");
}
