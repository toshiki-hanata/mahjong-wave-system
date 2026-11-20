"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";
import { logSecurityEvent } from "@/lib/security/security-log";
import { completeSuccessfulLogin } from "@/lib/auth/login-rate-limit";
import { destroyAdminSession, writeAdminSession } from "@/lib/auth/session";
import { acknowledgeMfaCodes, cancelMfaChallenge, completeMfaChallenge, recoverMfaChallenge, type MfaCompletion } from "@/lib/auth/mfa/service";
import { clearMfaPendingToken, readMfaPendingToken, writeMfaPendingToken } from "@/lib/auth/mfa/pending-cookie";
import { requireMfaOrigin } from "@/lib/auth/mfa/origin";

export type MfaFormState = { message?: string };
function failure(result: { status: string }): MfaFormState {
  return { message: result.status === "LIMITED" ? "試行回数の上限です。5分待ってからログインし直してください。" : "コードまたは有効期限を確認してください。使用済みの認証コードは使えません。" };
}
async function establish(result: Extract<MfaCompletion, { status: "COMPLETE" }>): Promise<void> {
  if (!prisma) throw new Error("追加認証を完了できません。");
  // Rate-counter maintenance must not undo a committed MFA verification.
  if (result.reservation) try { await completeSuccessfulLogin(prisma, result.reservation); } catch { logSecurityEvent("LOGIN_ERROR", "error"); }
  await writeAdminSession(result.grant);
  await clearMfaPendingToken();
  logSecurityEvent("LOGIN_SUCCESS", "info");
}

export async function verifyMfaAction(_previous: MfaFormState, form: FormData): Promise<MfaFormState> {
  let next = "/admin";
  try {
    await requireMfaOrigin();
    const code = form.get("code"), invitation = form.get("invitation");
    if (typeof code !== "string" || !/^\d{6}$/.test(code) || (invitation !== null && (typeof invitation !== "string" || invitation.length > 43))) return { message: "認証アプリの6桁コードを入力してください。" };
    if (!prisma) return { message: "接続を確認できません。時間をおいて再度お試しください。" };
    await assertRuntimeDatabaseRole(prisma);
    const result = await completeMfaChallenge(prisma, await readMfaPendingToken(), code, typeof invitation === "string" ? invitation : "");
    if (result.status === "CODES") { await writeMfaPendingToken(result.token); next = "/admin/mfa"; }
    else if (result.status === "COMPLETE") await establish(result);
    else return failure(result);
  } catch { logSecurityEvent("MFA_ERROR", "error"); return { message: "追加認証を完了できません。接続と設定を確認してください。" }; }
  redirect(next);
}

export async function recoverMfaAction(_previous: MfaFormState, form: FormData): Promise<MfaFormState> {
  try {
    await requireMfaOrigin();
    const code = form.get("recoveryCode");
    if (typeof code !== "string" || code.length > 64 || !/^[a-fA-F0-9-]{32,64}$/.test(code)) return { message: "保管した復旧コードを1つ入力してください。" };
    if (!prisma) return { message: "接続を確認できません。" };
    await assertRuntimeDatabaseRole(prisma);
    const result = await recoverMfaChallenge(prisma, await readMfaPendingToken(), code);
    if (result.status !== "PENDING") return failure(result);
    await destroyAdminSession();
    await writeMfaPendingToken(result.token);
  } catch { logSecurityEvent("MFA_ERROR", "error"); return { message: "復旧を完了できません。接続と設定を確認してください。" }; }
  redirect("/admin/mfa");
}

export async function acknowledgeMfaAction(_previous: MfaFormState, form: FormData): Promise<MfaFormState> {
  try {
    await requireMfaOrigin();
    if (form.get("saved") !== "on") return { message: "復旧コードの保管を確認してください。" };
    if (!prisma) return { message: "接続を確認できません。" };
    await assertRuntimeDatabaseRole(prisma);
    const result = await acknowledgeMfaCodes(prisma, await readMfaPendingToken());
    if (result.status !== "COMPLETE") return failure(result);
    await establish(result);
  } catch { logSecurityEvent("MFA_ERROR", "error"); return { message: "完了できません。復旧コードを控えてから再度お試しください。" }; }
  redirect("/admin");
}

export async function cancelMfaAction(): Promise<never> {
  try {
    await requireMfaOrigin();
    if (prisma) { await assertRuntimeDatabaseRole(prisma); await cancelMfaChallenge(prisma, await readMfaPendingToken()); }
    await clearMfaPendingToken();
  } catch { logSecurityEvent("MFA_ERROR", "error"); }
  redirect("/admin/login");
}
