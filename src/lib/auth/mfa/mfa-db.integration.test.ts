import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { generate } from "otplib";
import { assertConfiguredDatabaseTest } from "@/test/assert-db-test-config";
import { hashPassword } from "@/lib/auth/password";
import { acknowledgeMfaCodes, beginMfaChallenge, beginMfaReplacement, completeMfaChallenge, getMfaChallengeView, recoverMfaChallenge, type MfaActor } from "./service";
import { decryptMfaSecret, enrollmentTokenHash, newPendingToken, parseMfaChallengeToken, pendingTokenHash, signMfaChallengeToken } from "./crypto";
import { hasMfaProof } from "./policy";

const enabled = process.env.RUN_STAFF_MFA_DB_TESTS === "true", a = new PrismaClient(), b = new PrismaClient();
const reservation = { allowed: true, delayMs: 0, keys: [] };
const password = "fixture-mfa-private-password", rollback = new Error("ROLLBACK_MFA_VERIFICATION");
let passwordHash: string;
async function fixture(role: "OWNER" | "MANAGER" = "OWNER") {
  const store = await a.store.create({ data: { name: "MFA専用の架空店舗", timezone: "Asia/Tokyo" } });
  const staff = await a.staff.create({ data: { storeId: store.id, name: "架空管理者", role, loginId: randomUUID(), passwordHash } });
  const invitation = newPendingToken();
  await a.staffMfa.create({ data: { staffId: staff.id, storeId: store.id, enrollmentTokenHash: enrollmentTokenHash(invitation, { staffId: staff.id, storeId: store.id }), enrollmentExpiresAt: new Date(Date.now() + 3600000) } });
  return { actor: { id: staff.id, storeId: staff.storeId, role, sessionVersion: 0 } satisfies MfaActor, invitation };
}
async function begin(actor: MfaActor, db = a) {
  const result = await beginMfaChallenge(db, actor, reservation);
  if (result.status !== "PENDING") throw new Error("Expected private fixture challenge");
  return result.token;
}
async function otp(secret: string, previous = false) {
  let [clock] = await a.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (previous && clock.now.getTime() % 30000 > 20000) {
    await new Promise(resolve => setTimeout(resolve, 30200 - clock.now.getTime() % 30000));
    [clock] = await a.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  }
  return generate({ secret, epoch: Math.floor(clock.now.getTime() / 1000) - (previous ? 30 : 0) });
}
async function enroll(role: "OWNER" | "MANAGER" = "OWNER") {
  const { actor, invitation } = await fixture(role), token = await begin(actor);
  const view = (await getMfaChallengeView(a, token))!;
  // The previous step is deliberately accepted at enrollment so a current-step login can race without waiting 30s.
  const result = await completeMfaChallenge(a, token, await otp(view.secret!, true), invitation);
  if (result.status !== "CODES") throw new Error("Expected recovery-code receipt");
  const receipt = (await getMfaChallengeView(a, result.token))!;
  const acknowledged = await acknowledgeMfaCodes(a, result.token);
  if (acknowledged.status !== "COMPLETE") throw new Error("Expected complete enrolled fixture");
  return { actor: { ...actor, sessionVersion: acknowledged.grant.sessionVersion }, secret: view.secret!, codes: receipt.recoveryCodes!, grant: acknowledged.grant, token };
}

describe.skipIf(!enabled)("staff MFA in a freshly provisioned isolated PostgreSQL schema", () => {
  beforeAll(async () => {
    const app = new URL(process.env.DATABASE_URL ?? ""), direct = new URL(process.env.DIRECT_URL ?? "");
    if (!/^mfa_test_[a-f0-9]{32}$/.test(app.searchParams.get("schema") ?? "") || app.searchParams.get("schema") !== direct.searchParams.get("schema")) throw new Error("MFA integration requires an exclusively owned disposable schema");
    await assertConfiguredDatabaseTest(a);
    passwordHash = await hashPassword(password);
  });
  afterAll(async () => { await Promise.all([a.$disconnect(), b.$disconnect()]); });

  it("does not enroll an administrator without operator invitation provisioning", async () => {
    const { actor } = await fixture();
    await a.staffMfa.update({ where: { staffId: actor.id }, data: { enrollmentTokenHash: null, enrollmentExpiresAt: null } });
    expect(await beginMfaChallenge(a, actor, reservation)).toEqual({ status: "SETUP_REQUIRED" });
  });
  it.each(["OWNER", "MANAGER"] as const)("enrolls %s only after invitation plus TOTP, stores encrypted values, and requires code acknowledgment", async role => {
    const { actor, invitation } = await fixture(role), token = await begin(actor), view = (await getMfaChallengeView(a, token))!;
    expect((await completeMfaChallenge(a, token, await otp(view.secret!), newPendingToken())).status).toBe("INVALID");
    expect((await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } })).enabledAt).toBeNull();
    const result = await completeMfaChallenge(a, token, await otp(view.secret!), invitation);
    expect(result.status).toBe("CODES"); expect(result).not.toHaveProperty("grant");
    if (result.status !== "CODES") throw new Error("Expected code acknowledgment");
    const receipt = (await getMfaChallengeView(a, result.token))!;
    expect(receipt.kind).toBe("ACKNOWLEDGE"); expect(receipt.secret).toBeNull(); expect(receipt.recoveryCodes).toHaveLength(10);
    const records = JSON.stringify(await a.staffMfaChallenge.findMany({ where: { staffId: actor.id } }));
    expect(records).not.toContain(token); expect(records).not.toContain(invitation); expect(records).not.toContain(view.secret!);
    for (const code of receipt.recoveryCodes!) expect(records).not.toContain(code);
    const grant = await acknowledgeMfaCodes(a, result.token);
    expect(grant.status).toBe("COMPLETE");
    expect(await getMfaChallengeView(a, token)).toBeNull(); expect(await getMfaChallengeView(a, result.token)).toBeNull();
    expect((await completeMfaChallenge(a, token, await otp(view.secret!), invitation)).status).toBe("INVALID");
    expect((await acknowledgeMfaCodes(a, result.token)).status).toBe("INVALID");
    expect((await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } })).enrollmentTokenHash).toBeNull();
    expect(await a.auditLog.count({ where: { storeId: actor.storeId, action: "STAFF_MFA_ENROLLED" } })).toBe(1);
  });
  it("serializes independent verifiers so one current TOTP can be accepted only once", async () => {
    const { actor, secret } = await enroll(), first = await begin(actor), second = await begin(actor, b), code = await otp(secret);
    const results = await Promise.all([completeMfaChallenge(a, first, code, ""), completeMfaChallenge(b, second, code, "")]);
    expect(results.filter(r => r.status === "COMPLETE")).toHaveLength(1); expect(results.filter(r => r.status === "INVALID")).toHaveLength(1);
    expect(await a.auditLog.count({ where: { storeId: actor.storeId, action: "STAFF_MFA_VERIFIED" } })).toBe(1);
  });
  it("limits code failures across password challenges and reopens after the fixed window", async () => {
    const { actor, secret } = await enroll(), first = await begin(actor);
    const valid = await otp(secret), past = await otp(secret, true);
    const wrong = Array.from({ length: 10 }, (_, i) => String(i).padStart(6, "0")).find(c => c !== valid && c !== past)!;
    for (let i = 0; i < 2; i++) expect((await completeMfaChallenge(a, first, wrong, "")).status).toBe("INVALID");
    const second = await begin(actor);
    for (let i = 0; i < 3; i++) expect((await completeMfaChallenge(b, second, wrong, "")).status).toBe("INVALID");
    expect((await completeMfaChallenge(a, first, await otp(secret), "")).status).toBe("LIMITED");
    expect((await beginMfaChallenge(a, actor, reservation)).status).toBe("LIMITED");
    await a.staffMfa.update({ where: { staffId: actor.id }, data: { failureWindowStartedAt: new Date(Date.now() - 301000) } });
    expect((await completeMfaChallenge(a, first, await otp(secret), "")).status).toBe("COMPLETE");
  });
  it("consumes one recovery code across racing requests, revokes old sessions/factor, and grants only re-enrollment", async () => {
    const { actor, secret, codes, grant } = await enroll(), first = await begin(actor), second = await begin(actor, b);
    const results = await Promise.all([recoverMfaChallenge(a, first, codes[0]), recoverMfaChallenge(b, second, codes[0])]);
    expect(results.filter(r => r.status === "PENDING")).toHaveLength(1); expect(results.every(r => !("grant" in r))).toBe(true);
    const next = results.find(r => r.status === "PENDING"); if (!next || next.status !== "PENDING") throw new Error("Expected re-enrollment");
    const profile = await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } });
    expect(profile.secretCiphertext).toBeNull(); expect(profile.recoveryCodeHashes).toHaveLength(9);
    expect(hasMfaProof({ issuedAt: Date.now(), mfaVerifiedAt: grant.mfa.verifiedAt, mfaVersion: grant.mfa.version }, profile)).toBe(false);
    expect((await a.staff.findUniqueOrThrow({ where: { id: actor.id } })).sessionVersion).toBe(actor.sessionVersion + 1);
    expect((await recoverMfaChallenge(a, first, codes[0])).status).toBe("INVALID");
    const setup = (await getMfaChallengeView(a, next.token))!; expect(setup.kind).toBe("REPLACE"); expect(setup.secret).not.toBe(secret);
    const done = await completeMfaChallenge(a, next.token, await otp(setup.secret!), ""); if (done.status !== "CODES") throw new Error("Expected new recovery codes");
    const newCodes = (await getMfaChallengeView(a, done.token))!.recoveryCodes!;
    expect(newCodes.some(c => codes.includes(c))).toBe(false);
    expect((await acknowledgeMfaCodes(a, done.token)).status).toBe("COMPLETE");
    const active = await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } });
    expect(decryptMfaSecret(active.secretCiphertext!, { staffId: actor.id, storeId: actor.storeId, purpose: "active:" + active.version })).toBe(setup.secret);
  });
  it("requires the password and a fresh existing factor to replace an enrolled authenticator", async () => {
    const { actor, secret } = await enroll();
    expect((await beginMfaReplacement(a, actor, "incorrect", await otp(secret))).status).toBe("INVALID");
    const result = await beginMfaReplacement(a, actor, password, await otp(secret)); expect(result.status).toBe("PENDING");
    expect((await a.staff.findUniqueOrThrow({ where: { id: actor.id } })).sessionVersion).toBe(actor.sessionVersion + 1);
    expect((await beginMfaReplacement(a, actor, password, await otp(secret))).status).toBe("INVALID");
  });
  it.each(["disabled", "role", "version", "expired", "store"])("rejects a password challenge after %s changes", async change => {
    const { actor, invitation } = await fixture(), token = await begin(actor), view = (await getMfaChallengeView(a, token))!;
    if (change === "disabled") await a.staff.update({ where: { id: actor.id }, data: { isActive: false } });
    if (change === "role") await a.staff.update({ where: { id: actor.id }, data: { role: "STAFF" } });
    if (change === "version") await a.staff.update({ where: { id: actor.id }, data: { sessionVersion: { increment: 1 } } });
    if (change === "store") await a.store.update({ where: { id: actor.storeId }, data: { isActive: false } });
    if (change === "expired") await a.staffMfaChallenge.updateMany({ where: { staffId: actor.id }, data: { createdAt: new Date(Date.now() - 360000), expiresAt: new Date(Date.now() - 60000) } });
    const expiredRow = change === "expired" ? await a.staffMfaChallenge.findUniqueOrThrow({ where: { tokenHash: pendingTokenHash(parseMfaChallengeToken(token)!.token) } }) : null;
    const checkedToken = expiredRow ? signMfaChallengeToken(parseMfaChallengeToken(token)!.token, expiredRow) : token;
    expect(await getMfaChallengeView(a, checkedToken)).toBeNull();
    expect((await completeMfaChallenge(a, checkedToken, await otp(view.secret!), invitation)).status).toBe("INVALID");
  });
  it("rejects a valid pending cookie after its database binding is altered", async () => {
    const { actor, secret } = await enroll(), token = await begin(actor);
    await a.staffMfaChallenge.update({ where: { tokenHash: pendingTokenHash(parseMfaChallengeToken(token)!.token) }, data: { ipBucketKey: "0".repeat(64) } });
    expect(await getMfaChallengeView(a, token)).toBeNull();
    expect((await completeMfaChallenge(a, token, await otp(secret), "")).status).toBe("INVALID");
    expect(await a.auditLog.count({ where: { storeId: actor.storeId, action: "STAFF_MFA_VERIFIED" } })).toBe(0);
  });
  it("cannot turn an attacker-created receipt row into an authenticated session", async () => {
    const { actor } = await enroll(), raw = newPendingToken(), now = new Date();
    const profile = await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } });
    await a.staffMfaChallenge.create({ data: { storeId: actor.storeId, staffId: actor.id, tokenHash: pendingTokenHash(raw), kind: "ACKNOWLEDGE", role: actor.role, sessionVersion: actor.sessionVersion, mfaVersion: profile.version, recoveryCiphertext: "forged", verifiedAt: now, createdAt: now, expiresAt: new Date(now.getTime() + 300000) } });
    expect((await acknowledgeMfaCodes(a, raw + "." + newPendingToken())).status).toBe("INVALID");
  });
  it("rejects a forged unkeyed recovery hash after a database-only overwrite", async () => {
    const { actor } = await enroll(), token = await begin(actor), knownCode = "a".repeat(32);
    await a.staffMfa.update({ where: { staffId: actor.id }, data: { recoveryCodeHashes: [createHash("sha256").update(knownCode).digest("hex")] } });
    expect((await recoverMfaChallenge(a, token, knownCode)).status).toBe("INVALID");
  });
  it("cannot reuse another member's invitation hash to enroll an administrator", async () => {
    const owner = await fixture(), other = await fixture(), token = await begin(other.actor), view = (await getMfaChallengeView(a, token))!;
    await a.staffMfa.update({ where: { staffId: other.actor.id }, data: { enrollmentTokenHash: enrollmentTokenHash(owner.invitation, { storeId: owner.actor.storeId, staffId: owner.actor.id }) } });
    expect((await completeMfaChallenge(a, token, await otp(view.secret!), owner.invitation)).status).toBe("INVALID");
  });
  it("rolls back profile activation, version changes and audit together on a failed transaction", async () => {
    const { actor, invitation } = await fixture(), token = await begin(actor), view = (await getMfaChallengeView(a, token))!;
    const failing = { staffMfaChallenge: a.staffMfaChallenge, $transaction: async (fn: (value: Prisma.TransactionClient) => Promise<unknown>) => a.$transaction(async tx => { await fn(tx); throw rollback; }) } as unknown as Parameters<typeof completeMfaChallenge>[0];
    await expect(completeMfaChallenge(failing, token, await otp(view.secret!), invitation)).rejects.toBe(rollback);
    expect((await a.staffMfa.findUniqueOrThrow({ where: { staffId: actor.id } })).enabledAt).toBeNull();
    expect((await a.staff.findUniqueOrThrow({ where: { id: actor.id } })).sessionVersion).toBe(0);
    expect(await a.auditLog.count({ where: { storeId: actor.storeId } })).toBe(0);
    expect(await getMfaChallengeView(a, token)).toBeTruthy();
  });
});
