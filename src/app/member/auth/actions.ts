"use server";
import { logSecurityEvent } from "@/lib/security/security-log";
import { MemberAuthError } from "@/features/customer-auth/portal-config";
import { readPairingClaim } from "@/features/customer-auth/pairing-cookie";
import { memberMutation, memberCookie, challengeCookie, setMemberCookie, clearMemberCookie, MEMBER_COOKIE, CHALLENGE_COOKIE } from "@/features/customer-auth/portal-http";
import { beginMemberLogin, beginMemberRegistration, finishMemberLogin, finishMemberRegistration, regenerateMemberRecovery, acknowledgeMemberRecovery, removeMemberPasskey } from "@/features/customer-auth/portal-service";
import { revokeMemberSessions } from "@/features/customer-auth/portal-session";

function authFailure(error: unknown) { logSecurityEvent(error instanceof MemberAuthError ? "MEMBER_AUTH_FAILED" : "MEMBER_AUTH_ERROR"); return failed; }
const failed = { ok: false as const, message: "認証を完了できませんでした。有効期限・端末の対応状況を確認して、やり直してください。" };
export async function memberLoginOptionsAction() {
  try { const db = await memberMutation(), result = await beginMemberLogin(db); await setMemberCookie(CHALLENGE_COOKIE, result.token, result.expiresAt); return { ok: true as const, options: result.options }; } catch (error) { return authFailure(error); }
}
export async function memberLoginVerifyAction(response: unknown) {
  try { const db = await memberMutation(), result = await finishMemberLogin(db, await challengeCookie(), response, await memberCookie()); await setMemberCookie(MEMBER_COOKIE, result.token, result.expiresAt); await clearMemberCookie(CHALLENGE_COOKIE); return { ok: true as const }; } catch (error) { return authFailure(error); }
}
export async function memberRegistrationOptionsAction(kind: "ENROLL" | "ADD" | "RECOVER", recoveryCode?: string) {
  try {
    const db = await memberMutation(); if (!["ENROLL", "ADD", "RECOVER"].includes(kind)) return failed;
    const proof = kind === "ENROLL" ? await readPairingClaim() : kind === "ADD" ? await memberCookie() : recoveryCode;
    const result = await beginMemberRegistration(db, kind, proof); await setMemberCookie(CHALLENGE_COOKIE, result.token, result.expiresAt); return { ok: true as const, options: result.options };
  } catch (error) { return authFailure(error); }
}
export async function memberRegistrationVerifyAction(response: unknown, label: string) {
  try {
    const db = await memberMutation();
    // The challenge's server-side kind selects which cookie proof is accepted. Never accept a caller-supplied customer ID.
    const nonce = await challengeCookie(), session = await memberCookie(), claim = await readPairingClaim();
    const { hashPortalValue, portalTokenSchema } = await import("@/features/customer-auth/portal-policy");
    if (!portalTokenSchema.safeParse(nonce).success) return failed;
    const challenge = await db.customerAuthChallenge.findUnique({ where: { tokenHash: hashPortalValue("challenge", nonce!) }, select: { kind: true } });
    const result = await finishMemberRegistration(db, nonce, response, label, challenge?.kind === "ENROLL" ? claim : session, session);
    if (result.session) await setMemberCookie(MEMBER_COOKIE, result.session.token, result.session.expiresAt);
    await clearMemberCookie(CHALLENGE_COOKIE); return { ok: true as const, recovery: result.recovery };
  } catch (error) { return authFailure(error); }
}
export async function memberRecoveryRotateAction() {
  try { const db = await memberMutation(), result = await regenerateMemberRecovery(db, await memberCookie()); return { ok: true as const, recovery: result }; } catch (error) { return authFailure(error); }
}
export async function memberRecoveryAcknowledgeAction(generation: number) {
  try { const db = await memberMutation(false); await acknowledgeMemberRecovery(db, await memberCookie(), generation); return { ok: true as const }; } catch (error) { return authFailure(error); }
}
export async function memberPasskeyRemoveAction(id: string) {
  try { const db = await memberMutation(); await removeMemberPasskey(db, await memberCookie(), id); return { ok: true as const }; } catch (error) { return authFailure(error); }
}
export async function memberLogoutAction(all = false) {
  try { const db = await memberMutation(false); if (typeof all !== "boolean") return failed; await revokeMemberSessions(db, await memberCookie(), all); await clearMemberCookie(MEMBER_COOKIE); await clearMemberCookie(CHALLENGE_COOKIE); return { ok: true as const }; } catch (error) { return authFailure(error); }
}
