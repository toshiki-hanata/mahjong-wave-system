"use server";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { getCustomerAuthConfig } from "@/features/customer-auth/auth-config";
import { issueCustomerPairing, confirmStaffPairing, cancelCustomerPairing, CustomerLinkError, CustomerLinkRateError } from "@/features/customer-auth/pairing-service";

export type StaffLinkState = { message?: string; pairingId?: string; qrCode?: string; expiresAt?: string };
function fail(error: unknown): StaffLinkState {
  if (error instanceof CustomerLinkRateError) return { message: "発行が続いています。1分ほど待ってからお試しください。" };
  if (error instanceof CustomerLinkError) return { message: "連携できません。会員の登録状態・連携状況・QRの期限を確認してください。" };
  return { message: "連携を処理できませんでした。状態を確認してからやり直してください。" };
}
export async function issuePairingAction(customerId: string, _previous: StaffLinkState, form: FormData): Promise<StaffLinkState> {
  const actor = await requireStaff(), settings = getCustomerAuthConfig();
  const requestKey = form.get("requestKey");
  if (!prisma || !settings || typeof requestKey !== "string") return { message: "連携設定または接続状態を確認してください。" };
  try {
    const result = await issueCustomerPairing(prisma, { customerId, requestKey }, { storeId: actor.storeId, staffId: actor.id });
    revalidatePath(`/admin/customers/${customerId}/link`);
    if (!result.token) return { pairingId: result.pairingId, message: "この発行は処理済みです。QRが表示されない場合は、新しいQRを発行してください。" };
    const qrCode = await QRCode.toDataURL(`${settings.origin}/member/link#${result.token}`, { width: 256, margin: 2, errorCorrectionLevel: "M" });
    return { pairingId: result.pairingId, qrCode, expiresAt: result.expiresAt.toISOString() };
  } catch (error) { return fail(error); }
}
export async function confirmStaffPairingAction(customerId: string, _previous: StaffLinkState, form: FormData): Promise<StaffLinkState> {
  const actor = await requireStaff(), pairingId = form.get("pairingId");
  if (!prisma || typeof pairingId !== "string" || form.get("confirmed") !== "on") return { message: "お客さんの画面と確認番号を照合してからチェックしてください。" };
  try { await confirmStaffPairing(prisma, pairingId, customerId, { storeId: actor.storeId, staffId: actor.id }); } catch (error) { return fail(error); }
  revalidatePath(`/admin/customers/${customerId}/link`);
  return { message: "店員側の確認を記録しました。パスキー登録の完了まで確認してください。" };
}
export async function cancelPairingAction(customerId: string, _previous: StaffLinkState, form: FormData): Promise<StaffLinkState> {
  const actor = await requireStaff(), pairingId = form.get("pairingId");
  if (!prisma || typeof pairingId !== "string") return { message: "連携情報を確認できません。" };
  try { await cancelCustomerPairing(prisma, pairingId, customerId, { storeId: actor.storeId, staffId: actor.id }); } catch (error) { return fail(error); }
  revalidatePath(`/admin/customers/${customerId}/link`);
  return { message: "この連携QRを取り消しました。" };
}
