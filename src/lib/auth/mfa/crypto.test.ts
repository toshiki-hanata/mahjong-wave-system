import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "otplib";
import { decryptMfaSecret, encryptMfaSecret, enrollmentTokenHash, matchingRecoveryHash, mfaEncryptionKey, newPendingToken, newRecoveryCodes, newTotpSecret, pendingTokenHash, recoveryCodeHash, signMfaChallengeToken, totpUri, verifyMfaChallengeToken, verifyTotp } from "./crypto";
import { hasMfaProof, requiresStaffMfa } from "./policy";
const key = Buffer.alloc(32, 71).toString("base64"), owner = { staffId: "fixture-owner", storeId: "fixture-store", purpose: "active" };
beforeEach(() => vi.stubEnv("STAFF_MFA_ENCRYPTION_KEY", key));
afterEach(() => vi.unstubAllEnvs());

describe("staff MFA cryptographic boundary", () => {
  it("requires an independent, correctly encoded encryption key without a SESSION_SECRET fallback", () => {
    expect(mfaEncryptionKey()).toHaveLength(32);
    vi.stubEnv("SESSION_SECRET", "a-valid-session-secret-is-not-an-mfa-key");
    vi.stubEnv("STAFF_MFA_ENCRYPTION_KEY", "");
    expect(() => mfaEncryptionKey()).toThrow("安全設定");
  });
  it("encrypts each seed with a fresh authenticated IV and binds the store, staff, and purpose", () => {
    const secret = newTotpSecret(), a = encryptMfaSecret(secret, owner), b = encryptMfaSecret(secret, owner);
    expect(a).not.toBe(b); expect(a).not.toContain(secret); expect(decryptMfaSecret(a, owner)).toBe(secret);
    for (const change of [{ storeId: "foreign" }, { staffId: "foreign" }, { purpose: "challenge:other" }]) expect(() => decryptMfaSecret(a, { ...owner, ...change })).toThrow("安全設定");
    expect(() => decryptMfaSecret(a.slice(0, -5) + "AAAAA", owner)).toThrow();
    vi.stubEnv("STAFF_MFA_ENCRYPTION_KEY", Buffer.alloc(32, 72).toString("base64"));
    expect(() => decryptMfaSecret(a, owner)).toThrow();
  });
  it.each([[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"]])("matches the RFC6238 SHA1 vector at %s with six digits", async (epoch, token) => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(await verifyTotp(secret, token, new Date(epoch * 1000), null)).toBe(Math.floor(epoch / 30));
  });
  it("allows one past step, rejects the future and old steps, and rejects replay", async () => {
    const secret = newTotpSecret(), epoch = 1800000005, now = new Date(epoch * 1000);
    const current = await generate({ secret, epoch }), past = await generate({ secret, epoch: epoch - 30 }), old = await generate({ secret, epoch: epoch - 60 }), future = await generate({ secret, epoch: epoch + 30 });
    const step = await verifyTotp(secret, current, now, null);
    expect(step).toBe(Math.floor(epoch / 30)); expect(await verifyTotp(secret, current, now, step)).toBeNull();
    expect(await verifyTotp(secret, past, now, null)).toBe(Math.floor(epoch / 30) - 1);
    expect(await verifyTotp(secret, old, now, null)).toBeNull(); expect(await verifyTotp(secret, future, now, null)).toBeNull();
    expect(await verifyTotp(secret, "<html>", now, null)).toBeNull();
  });
  it("creates independent high-entropy recovery codes and stores only identity-bound hashes", () => {
    const codes = newRecoveryCodes(); expect(new Set(codes).size).toBe(10);
    expect(codes.every(c => /^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/.test(c))).toBe(true);
    const hashes = codes.map(c => recoveryCodeHash(c, owner)!);
    expect(hashes.every(h => /^[a-f0-9]{64}$/.test(h))).toBe(true);
    expect(matchingRecoveryHash(codes[0].toUpperCase(), hashes, owner)).toBe(hashes[0]);
    expect(matchingRecoveryHash(codes[0], hashes, { ...owner, staffId: "other" })).toBeNull();
    expect(matchingRecoveryHash(codes[0], hashes.slice(1), owner)).toBeNull();
    vi.stubEnv("STAFF_MFA_ENCRYPTION_KEY", Buffer.alloc(32, 72).toString("base64"));
    expect(matchingRecoveryHash(codes[0], hashes, owner)).toBeNull();
  });
  it("binds the operator invitation to both the server key and intended identity", () => {
    const token = newPendingToken(), expected = enrollmentTokenHash(token, owner);
    expect(enrollmentTokenHash(token, { ...owner, staffId: "other" })).not.toBe(expected);
    vi.stubEnv("STAFF_MFA_ENCRYPTION_KEY", Buffer.alloc(32, 72).toString("base64"));
    expect(enrollmentTokenHash(token, owner)).not.toBe(expected);
  });
  it("authenticates pending-stage metadata to reject DB row substitution and fabricated receipts", () => {
    const token = newPendingToken(), now = new Date();
    const row = { id: "fixture-challenge", tokenHash: pendingTokenHash(token), storeId: "fixture-store", staffId: "fixture-owner", kind: "VERIFY", role: "OWNER", sessionVersion: 3, mfaVersion: 2, createdAt: now, expiresAt: new Date(now.getTime() + 300000), verifiedAt: null, secretCiphertext: null, recoveryCiphertext: null, ipBucketKey: null, loginBucketKey: null };
    const signed = signMfaChallengeToken(token, row);
    expect(verifyMfaChallengeToken(signed, row)).toBe(true);
    for (const changes of [{ staffId: "other" }, { storeId: "other" }, { role: "MANAGER" }, { kind: "ACKNOWLEDGE" }, { sessionVersion: 4 }, { mfaVersion: 3 }, { recoveryCiphertext: "fake" }, { expiresAt: new Date(now.getTime() + 301000) }]) expect(verifyMfaChallengeToken(signed, { ...row, ...changes })).toBe(false);
    expect(verifyMfaChallengeToken(token + "." + newPendingToken(), row)).toBe(false);
  });
  it("keeps token identities out of URLs and creates a compatible enrollment URI", () => {
    const token = newPendingToken(); expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(pendingTokenHash(token)).not.toContain(token);
    const uri = new URL(totpUri(newTotpSecret(), "fixture-admin"));
    expect(uri.protocol).toBe("otpauth:"); expect(uri.searchParams.get("digits")).toBe("6"); expect(uri.searchParams.get("period")).toBe("30");
  });
  it("requires an enrolled current factor and a signed MFA proof for both administrator roles", () => {
    expect(requiresStaffMfa("OWNER")).toBe(true); expect(requiresStaffMfa("MANAGER")).toBe(true); expect(requiresStaffMfa("STAFF")).toBe(false);
    const now = Date.now(), profile = { enabledAt: new Date(now), secretCiphertext: "fixture-encrypted", version: 2 }, session = { issuedAt: now, mfaVerifiedAt: now - 1000, mfaVersion: 2 };
    expect(hasMfaProof(session, profile)).toBe(true);
    expect(hasMfaProof({ issuedAt: now }, profile)).toBe(false);
    expect(hasMfaProof({ ...session, mfaVersion: 1 }, profile)).toBe(false);
    expect(hasMfaProof(session, { ...profile, secretCiphertext: null })).toBe(false);
    expect(hasMfaProof({ ...session, mfaVerifiedAt: now - 331000 }, profile)).toBe(false);
  });
});
