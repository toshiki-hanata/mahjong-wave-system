"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { requireStaffActionPermit } from "@/lib/auth/staff-action-permit";
import { beginMfaReplacement } from "@/lib/auth/mfa/service";
import { writeMfaPendingToken } from "@/lib/auth/mfa/pending-cookie";
import { destroyAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security/security-log";
export type MfaReplacementState = { message?: string };
export async function replaceStaffMfaAction(_previous: MfaReplacementState, form: FormData): Promise<MfaReplacementState> {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const password = form.get("password"), code = form.get("code");
  if (typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72 || typeof code !== "string" || !/^\d{6}$/.test(code)) return { message: "現在のパスワードと認証アプリの新しい6桁コードを入力してください。" };
  if (!prisma) return { message: "接続を確認できません。" };
  await requireStaffActionPermit(actor);
  try {
    const result = await beginMfaReplacement(prisma, actor, password, code);
    if (result.status !== "PENDING") return { message: result.status === "LIMITED" ? "5分待ってからやり直してください。" : "現在のパスワードと未使用の認証コードを確認してください。" };
    await destroyAdminSession();
    await writeMfaPendingToken(result.token);
  } catch { logSecurityEvent("MFA_ERROR", "error"); return { message: "再設定を開始できません。接続と設定を確認してください。" }; }
  redirect("/admin/mfa");
}
