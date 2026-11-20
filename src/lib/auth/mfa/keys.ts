// Node-only primitives shared by the server and the private operator CLI. Never import into UI components.
import { createHmac, hkdfSync } from "node:crypto";
export class MfaConfigurationError extends Error {
  constructor() { super("追加認証の安全設定を確認してください。"); }
}
export function mfaEncryptionKey(env: Readonly<Record<string, string | undefined>> = process.env): Buffer {
  const encoded = env.STAFF_MFA_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new MfaConfigurationError();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new MfaConfigurationError();
  return key;
}
export function mfaSubkey(purpose: "encryption" | "enrollment" | "recovery" | "challenge", env: Readonly<Record<string, string | undefined>> = process.env): Buffer {
  return Buffer.from(hkdfSync("sha256", mfaEncryptionKey(env), Buffer.alloc(0), "wave-staff-mfa:v1:" + purpose, 32));
}
export function boundEnrollmentHash(token: string, context: { storeId: string; staffId: string }, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return createHmac("sha256", mfaSubkey("enrollment", env)).update(JSON.stringify(["wave-mfa-enrollment-v1", context.storeId, context.staffId, token])).digest("hex");
}
