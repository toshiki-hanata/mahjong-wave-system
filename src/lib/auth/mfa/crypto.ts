import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { boundEnrollmentHash, MfaConfigurationError, mfaSubkey } from "./keys";
export { mfaEncryptionKey, MfaConfigurationError } from "./keys";

export type SecretContext = { storeId: string; staffId: string; purpose: string };
const aad = (context: SecretContext) => Buffer.from(JSON.stringify(["wave-staff-mfa-v1", context.storeId, context.staffId, context.purpose]));

export function encryptMfaValue(secret: string, context: SecretContext): string {
  if (Buffer.byteLength(secret, "utf8") > 2048) throw new MfaConfigurationError();
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", mfaSubkey("encryption"), iv);
  cipher.setAAD(aad(context));
  const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}

export function decryptMfaValue(value: string, context: SecretContext): string {
  try {
    if (value.length > 4096) throw new MfaConfigurationError();
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new MfaConfigurationError();
    const [, iv, tag, payload] = parts.map((p, i) => i === 0 ? Buffer.alloc(0) : Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new MfaConfigurationError();
    const cipher = createDecipheriv("aes-256-gcm", mfaSubkey("encryption"), iv);
    cipher.setAAD(aad(context)); cipher.setAuthTag(tag);
    const secret = Buffer.concat([cipher.update(payload), cipher.final()]).toString("utf8");
    return secret;
  } catch { throw new MfaConfigurationError(); }
}
export function encryptMfaSecret(secret: string, context: SecretContext): string {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new MfaConfigurationError();
  return encryptMfaValue(secret, context);
}
export function decryptMfaSecret(value: string, context: SecretContext): string {
  const secret = decryptMfaValue(value, context);
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new MfaConfigurationError();
  return secret;
}

export function newTotpSecret(): string { return generateSecret({ length: 20 }); }
export function totpUri(secret: string, label: string): string {
  const uri = new URL(generateURI({ issuer: "麻雀ウェーブ", label, secret, algorithm: "sha1", digits: 6, period: 30 }));
  uri.searchParams.set("algorithm", "SHA1"); uri.searchParams.set("digits", "6"); uri.searchParams.set("period", "30");
  return uri.toString();
}

/** A current or one previous step is accepted; future and already-used steps are rejected. */
export async function verifyTotp(secret: string, token: string, now: Date, lastStep: number | null): Promise<number | null> {
  if (!/^\d{6}$/.test(token)) return null;
  const result = await verify({ secret, token, strategy: "totp", algorithm: "sha1", digits: 6, period: 30,
    epoch: Math.floor(now.getTime() / 1000), epochTolerance: [30, 0], ...(lastStep === null ? {} : { afterTimeStep: lastStep }) });
  return result.valid && "timeStep" in result ? result.timeStep : null;
}

export function newPendingToken(): string { return randomBytes(32).toString("base64url"); }
export function isPendingToken(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function pendingTokenHash(value: string): string { return createHash("sha256").update("wave-mfa-challenge-v1:" + value).digest("hex"); }
export function enrollmentTokenHash(value: string, context: Pick<SecretContext, "storeId" | "staffId">): string { return boundEnrollmentHash(value, context); }
export function newRecoveryCodes(): string[] { return Array.from({ length: 10 }, () => randomBytes(16).toString("hex").match(/.{8}/g)!.join("-")); }
export function recoveryCodeHash(code: string, context: Pick<SecretContext, "storeId" | "staffId">): string | null {
  const normalized = code.toLowerCase().replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/.test(normalized)) return null;
  return createHmac("sha256", mfaSubkey("recovery")).update(JSON.stringify(["wave-mfa-recovery-v1", context.storeId, context.staffId, normalized])).digest("hex");
}

type ChallengeBinding = { id: string; tokenHash: string; storeId: string; staffId: string; kind: string; role: string; sessionVersion: number; mfaVersion: number; createdAt: Date; expiresAt: Date; verifiedAt: Date | null; secretCiphertext: string | null; recoveryCiphertext: string | null; ipBucketKey: string | null; loginBucketKey: string | null };
function challengeProof(row: ChallengeBinding): Buffer {
  return createHmac("sha256", mfaSubkey("challenge")).update(JSON.stringify(["wave-mfa-challenge-proof-v1", row.id, row.tokenHash, row.storeId, row.staffId, row.kind, row.role, row.sessionVersion, row.mfaVersion, row.createdAt.getTime(), row.expiresAt.getTime(), row.verifiedAt?.getTime() ?? null, row.secretCiphertext, row.recoveryCiphertext, row.ipBucketKey, row.loginBucketKey])).digest();
}
export function parseMfaChallengeToken(value: unknown): { token: string; proof: string } | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [token, proof] = value.split("."); return { token, proof };
}
export function signMfaChallengeToken(token: string, row: ChallengeBinding): string {
  if (!isPendingToken(token) || pendingTokenHash(token) !== row.tokenHash) throw new MfaConfigurationError();
  return token + "." + challengeProof(row).toString("base64url");
}
export function verifyMfaChallengeToken(value: string, row: ChallengeBinding): boolean {
  const parsed = parseMfaChallengeToken(value);
  if (!parsed || pendingTokenHash(parsed.token) !== row.tokenHash) return false;
  const proof = Buffer.from(parsed.proof, "base64url");
  return proof.length === 32 && timingSafeEqual(proof, challengeProof(row));
}
export function matchingRecoveryHash(code: string, hashes: readonly string[], context: Pick<SecretContext, "storeId" | "staffId">): string | null {
  const hash = recoveryCodeHash(code, context);
  if (!hash) return null;
  const expected = Buffer.from(hash, "hex");
  return hashes.find(candidate => /^[a-f0-9]{64}$/.test(candidate) && timingSafeEqual(expected, Buffer.from(candidate, "hex"))) ?? null;
}
