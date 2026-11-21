import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
export const PORTAL_POLICY = Object.freeze({ publicRequestsPerMinute: 30, bodyBytes: 65536, sessionMaximum: 20 });
export const portalTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const credentialIdSchema = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);
export const credentialLabelSchema = z.string().trim().min(1).max(80).refine(s => !/[\u0000-\u001f\u007f]/.test(s));
export function createPortalToken(): string { return randomBytes(32).toString("base64url"); }
export function hashPortalValue(purpose: "session" | "challenge" | "recovery" | "rate", value: string, secret = process.env.SESSION_SECRET ?? ""): string {
  if (secret.length < 32) throw new Error("顧客認証の安全設定を確認してください。");
  return createHmac("sha256", secret).update(`wave-member:v1:${purpose}\0${value}`).digest("hex");
}
export function newRecoveryCode(): string { return randomBytes(20).toString("hex").toUpperCase().match(/.{1,8}/g)!.join("-"); }
export function normalizedRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 80) return null;
  const code = raw.trim().replaceAll("-", "").toLowerCase(); return /^[a-f0-9]{40}$/.test(code) ? code : null;
}
export function validWebAuthnEnvelope(raw: unknown, registration: boolean): boolean {
  try {
    if (!raw || typeof raw !== "object" || Buffer.byteLength(JSON.stringify(raw), "utf8") > PORTAL_POLICY.bodyBytes) return false;
    const value = raw as Record<string, unknown>;
    if (!credentialIdSchema.safeParse(value.id).success || value.rawId !== value.id || value.type !== "public-key" || !value.response || typeof value.response !== "object") return false;
    const response = value.response as Record<string, unknown>;
    const base64 = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v);
    if (!base64(response.clientDataJSON, 8192)) return false;
    return registration ? base64(response.attestationObject, 49152) : base64(response.authenticatorData, 8192) && base64(response.signature, 8192) && (response.userHandle === null || response.userHandle === undefined || base64(response.userHandle, 128));
  } catch { return false; }
}
export function sameUserHandle(encoded: string | null | undefined, handle: string): boolean {
  if (!encoded) return false;
  try { return Buffer.from(encoded, "base64url").toString("base64url") === encoded && Buffer.from(encoded, "base64url").equals(Buffer.from(handle, "utf8")); } catch { return false; }
}
