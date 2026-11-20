import "server-only";
import { applicationSqlTable } from "@/lib/security/sql-namespace";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient, type Role, type StaffMfa, type StaffMfaChallengeKind } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { verifyPassword } from "@/lib/auth/password";
import type { LoginAttemptReservation } from "@/lib/auth/login-rate-limit";
import { decryptMfaSecret, decryptMfaValue, encryptMfaSecret, encryptMfaValue, enrollmentTokenHash, isPendingToken, matchingRecoveryHash, mfaEncryptionKey, newPendingToken, newRecoveryCodes, newTotpSecret, parseMfaChallengeToken, pendingTokenHash, recoveryCodeHash, signMfaChallengeToken, verifyMfaChallengeToken, verifyTotp } from "./crypto";
import { MFA_POLICY, requiresStaffMfa } from "./policy";

type Database = Pick<PrismaClient, "$transaction" | "staffMfaChallenge">;
export type MfaActor = { id: string; storeId: string; role: Role; sessionVersion: number };
export type MfaGrant = { staffId: string; storeId: string; role: Role; sessionVersion: number; mfa: { verifiedAt: number; version: number } };
export type MfaFailure = { status: "INVALID" | "LIMITED" | "SETUP_REQUIRED" };
export type MfaCompletion = MfaFailure | { status: "CODES"; token: string } | { status: "COMPLETE"; grant: MfaGrant; reservation?: LoginAttemptReservation };
const include = { profile: { include: { staff: { include: { store: { select: { isActive: true } } } } } } } as const;
type Challenge = Prisma.StaffMfaChallengeGetPayload<{ include: typeof include }>;

async function clock(tx: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!(rows[0]?.now instanceof Date)) throw new Error("追加認証を確認できません。");
  return rows[0].now;
}
async function lockStore(tx: Prisma.TransactionClient, storeId: string, staffId: string) {
  const table = applicationSqlTable("Store");
  const stores = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM ${table} WHERE "id" = ${storeId} FOR UPDATE`;
  if (stores.length !== 1) throw new Error("追加認証のDB範囲を確認してください。");
  // Keep the replay/attempt row explicitly locked as well, using schema-qualified ORM.
  await tx.staffMfa.updateMany({ where: { storeId, staffId }, data: { failedAttempts: { increment: 0 } } });
}
function context(profile: Pick<StaffMfa, "staffId" | "storeId">, purpose: string) { return { staffId: profile.staffId, storeId: profile.storeId, purpose }; }
function fresh(challenge: Challenge, now: Date): boolean {
  const { profile } = challenge, { staff } = profile;
  return !challenge.consumedAt && challenge.expiresAt > now && challenge.createdAt <= now
    && staff.isActive && staff.store.isActive && requiresStaffMfa(staff.role) && staff.role === challenge.role
    && staff.sessionVersion === challenge.sessionVersion && profile.version === challenge.mfaVersion
    && (challenge.kind === "ENROLL" ? !profile.enabledAt : Boolean(profile.enabledAt));
}
async function attempt(tx: Prisma.TransactionClient, profile: StaffMfa, now: Date): Promise<boolean> {
  if (now.getTime() - profile.failureWindowStartedAt.getTime() >= MFA_POLICY.failureWindowMs) {
    await tx.staffMfa.update({ where: { staffId: profile.staffId }, data: { failedAttempts: 0, failureWindowStartedAt: now } });
    profile.failedAttempts = 0; profile.failureWindowStartedAt = now;
  }
  return profile.failedAttempts < MFA_POLICY.maximumFailures;
}
async function failed(tx: Prisma.TransactionClient, profile: StaffMfa, kind: string): Promise<MfaFailure> {
  await tx.staffMfa.update({ where: { staffId: profile.staffId }, data: { failedAttempts: { increment: 1 } } });
  await recordAuditLog({ storeId: profile.storeId, actorStaffId: profile.staffId, action: "STAFF_MFA_FAILED", entityType: "StaffMfa", entityId: profile.staffId, metadata: { kind } }, tx);
  return { status: "INVALID" };
}
async function nextSessionVersion(tx: Prisma.TransactionClient, actor: MfaActor): Promise<number> {
  const result = await tx.staff.updateMany({ where: { id: actor.id, storeId: actor.storeId, isActive: true, role: actor.role, sessionVersion: actor.sessionVersion }, data: { sessionVersion: { increment: 1 } } });
  if (result.count !== 1) throw new Error("追加認証をやり直してください。");
  return actor.sessionVersion + 1;
}
async function createChallenge(tx: Prisma.TransactionClient, actor: MfaActor, profile: StaffMfa, kind: StaffMfaChallengeKind, now: Date, reservation?: LoginAttemptReservation): Promise<{ status: "PENDING"; token: string }> {
  // Expired authentication state is disposable; business history is never touched.
  await tx.staffMfaChallenge.deleteMany({ where: { storeId: actor.storeId, staffId: actor.id, expiresAt: { lte: now } } });
  const id = randomUUID(), token = newPendingToken();
  const created = await tx.staffMfaChallenge.create({ data: {
    id, storeId: actor.storeId, staffId: actor.id, tokenHash: pendingTokenHash(token), kind, role: actor.role,
    sessionVersion: actor.sessionVersion, mfaVersion: profile.version,
    secretCiphertext: kind === "VERIFY" ? null : encryptMfaSecret(newTotpSecret(), context(profile, "challenge:" + id)),
    ipBucketKey: reservation?.keys.find(x => x.dimension === "IP")?.bucketKey,
    loginBucketKey: reservation?.keys.find(x => x.dimension === "LOGIN_ID")?.bucketKey,
    createdAt: now, expiresAt: new Date(now.getTime() + MFA_POLICY.challengeMs),
  } });
  return { status: "PENDING", token: signMfaChallengeToken(token, created) };
}

/** Called only after password verification. The actor is re-read under the store lock. */
export async function beginMfaChallenge(database: Database, actor: MfaActor, reservation: LoginAttemptReservation): Promise<MfaFailure | { status: "PENDING"; token: string }> {
  mfaEncryptionKey();
  return database.$transaction(async tx => {
    await lockStore(tx, actor.storeId, actor.id);
    const staff = await tx.staff.findFirst({ where: { id: actor.id, storeId: actor.storeId, isActive: true, role: actor.role, sessionVersion: actor.sessionVersion, store: { isActive: true } } });
    if (!staff || !requiresStaffMfa(staff.role)) return { status: "INVALID" };
    const profile = await tx.staffMfa.findUnique({ where: { staffId: staff.id } }), now = await clock(tx);
    if (!profile || (!profile.enabledAt && (!profile.enrollmentTokenHash || !profile.enrollmentExpiresAt || profile.enrollmentExpiresAt <= now))) return { status: "SETUP_REQUIRED" };
    if (!await attempt(tx, profile, now)) return { status: "LIMITED" };
    if (await tx.staffMfaChallenge.count({ where: { storeId: actor.storeId, staffId: actor.id, mfaVersion: profile.version, sessionVersion: actor.sessionVersion, consumedAt: null, expiresAt: { gt: now } } }) >= MFA_POLICY.maximumPending) return { status: "LIMITED" };
    return createChallenge(tx, actor, profile, profile.enabledAt ? "VERIFY" : "ENROLL", now, reservation);
  });
}

async function inChallenge<T>(database: Database, token: string | null, callback: (tx: Prisma.TransactionClient, row: Challenge, now: Date) => Promise<T>): Promise<T | MfaFailure> {
  const parsed = parseMfaChallengeToken(token);
  if (!parsed || !token) return { status: "INVALID" };
  mfaEncryptionKey();
  const tokenHash = pendingTokenHash(parsed.token);
  const hint = await database.staffMfaChallenge.findUnique({ where: { tokenHash } });
  if (!hint || hint.consumedAt || hint.expiresAt.getTime() + 30000 <= Date.now() || !verifyMfaChallengeToken(token, hint)) return { status: "INVALID" };
  return database.$transaction(async tx => {
    await lockStore(tx, hint.storeId, hint.staffId);
    const row = await tx.staffMfaChallenge.findUnique({ where: { tokenHash }, include });
    const now = await clock(tx);
    if (!row || !verifyMfaChallengeToken(token, row) || !fresh(row, now)) return { status: "INVALID" };
    return callback(tx, row, now);
  }, { maxWait: 10000, timeout: 20000 });
}

/** A page may only disclose an enrollment seed for an active password-bound enrollment challenge. */
export async function getMfaChallengeView(database: Pick<PrismaClient, "staffMfaChallenge" | "$queryRaw">, token: string | null) {
  const parsed = parseMfaChallengeToken(token);
  if (!parsed || !token) return null;
  mfaEncryptionKey();
  const tokenHash = pendingTokenHash(parsed.token);
  const hint = await database.staffMfaChallenge.findUnique({ where: { tokenHash } });
  if (!hint || !verifyMfaChallengeToken(token, hint)) return null;
  const row = await database.staffMfaChallenge.findUnique({ where: { tokenHash }, include });
  if (!row || !verifyMfaChallengeToken(token, row) || !fresh(row, await clock(database))) return null;
  return {
    kind: row.kind, expiresAt: row.expiresAt.getTime(), label: row.profile.staff.loginId,
    secret: ["ENROLL", "REPLACE"].includes(row.kind) && row.secretCiphertext ? decryptMfaSecret(row.secretCiphertext, context(row.profile, "challenge:" + row.id)) : null,
    recoveryCodes: row.kind === "ACKNOWLEDGE" && row.recoveryCiphertext ? JSON.parse(decryptMfaValue(row.recoveryCiphertext, context(row.profile, "receipt:" + row.id))) as string[] : null,
    recoveryRequired: row.kind === "VERIFY" && !row.profile.secretCiphertext,
  };
}

export async function completeMfaChallenge(database: Database, token: string | null, code: string, invitation: string): Promise<MfaCompletion> {
  return inChallenge(database, token, async (tx, row, now): Promise<MfaCompletion> => {
    const profile = row.profile, staff = profile.staff;
    if (row.kind === "ACKNOWLEDGE") return { status: "INVALID" };
    if (!await attempt(tx, profile, now)) return { status: "LIMITED" };
    if (row.kind === "ENROLL") {
      const hash = isPendingToken(invitation) ? enrollmentTokenHash(invitation, profile) : null;
      if (!hash || !profile.enrollmentTokenHash || !profile.enrollmentExpiresAt || profile.enrollmentExpiresAt <= now || !timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(profile.enrollmentTokenHash, "hex"))) return failed(tx, profile, "enrollment");
    }
    const ciphertext = row.kind === "VERIFY" ? profile.secretCiphertext : row.secretCiphertext;
    if (!ciphertext) return failed(tx, profile, "verification");
    const secret = decryptMfaSecret(ciphertext, context(profile, row.kind === "VERIFY" ? "active:" + profile.version : "challenge:" + row.id));
    const step = await verifyTotp(secret, code, now, row.kind === "VERIFY" ? profile.lastAcceptedStep : null);
    if (step === null) return failed(tx, profile, "verification");
    const changing = row.kind !== "VERIFY", codes = changing ? newRecoveryCodes() : undefined;
    const version = profile.version + (changing ? 1 : 0);
    await tx.staffMfa.update({ where: { staffId: staff.id }, data: {
      lastAcceptedStep: step, failedAttempts: 0, failureWindowStartedAt: now,
      ...(changing ? { secretCiphertext: encryptMfaSecret(secret, context(profile, "active:" + version)), enabledAt: profile.enabledAt ?? now, version,
        recoveryCodeHashes: codes!.map(value => recoveryCodeHash(value, profile)!), enrollmentTokenHash: null, enrollmentExpiresAt: null } : {}),
    } });
    const actor = { id: staff.id, storeId: staff.storeId, role: staff.role, sessionVersion: staff.sessionVersion };
    const sessionVersion = changing ? await nextSessionVersion(tx, actor) : staff.sessionVersion;
    await tx.staffMfaChallenge.update({ where: { id: row.id }, data: { consumedAt: now, secretCiphertext: null } });
    await recordAuditLog({ storeId: staff.storeId, actorStaffId: staff.id, action: row.kind === "ENROLL" ? "STAFF_MFA_ENROLLED" : changing ? "STAFF_MFA_REPLACED" : "STAFF_MFA_VERIFIED", entityType: "StaffMfa", entityId: staff.id }, tx);
    if (codes) {
      const id = randomUUID(), receiptToken = newPendingToken();
      const receipt = await tx.staffMfaChallenge.create({ data: { id, staffId: staff.id, storeId: staff.storeId, tokenHash: pendingTokenHash(receiptToken), kind: "ACKNOWLEDGE", role: staff.role, sessionVersion, mfaVersion: version, verifiedAt: now,
        recoveryCiphertext: encryptMfaValue(JSON.stringify(codes), context(profile, "receipt:" + id)), ipBucketKey: row.ipBucketKey, loginBucketKey: row.loginBucketKey, createdAt: now, expiresAt: new Date(now.getTime() + MFA_POLICY.challengeMs) } });
      return { status: "CODES", token: signMfaChallengeToken(receiptToken, receipt) };
    }
    return { status: "COMPLETE", grant: { staffId: staff.id, storeId: staff.storeId, role: staff.role, sessionVersion, mfa: { verifiedAt: now.getTime(), version } },
      ...(row.ipBucketKey && row.loginBucketKey ? { reservation: { allowed: true, delayMs: 0, keys: [{ dimension: "IP", bucketKey: row.ipBucketKey }, { dimension: "LOGIN_ID", bucketKey: row.loginBucketKey }] } } : {}),
    };
  });
}

export async function acknowledgeMfaCodes(database: Database, token: string | null): Promise<MfaCompletion> {
  return inChallenge(database, token, async (tx, row, now): Promise<MfaCompletion> => {
    if (row.kind !== "ACKNOWLEDGE" || !row.recoveryCiphertext || !row.verifiedAt || !row.profile.secretCiphertext) return { status: "INVALID" };
    const codes: unknown = JSON.parse(decryptMfaValue(row.recoveryCiphertext, context(row.profile, "receipt:" + row.id)));
    if (!Array.isArray(codes) || codes.length !== 10 || !codes.every(code => typeof code === "string" && matchingRecoveryHash(code, row.profile.recoveryCodeHashes, row.profile))) return { status: "INVALID" };
    await tx.staffMfaChallenge.update({ where: { id: row.id }, data: { consumedAt: now, recoveryCiphertext: null } });
    await recordAuditLog({ storeId: row.storeId, actorStaffId: row.staffId, action: "STAFF_MFA_CODES_ACKNOWLEDGED", entityType: "StaffMfa", entityId: row.staffId }, tx);
    return { status: "COMPLETE", grant: { staffId: row.staffId, storeId: row.storeId, role: row.role, sessionVersion: row.sessionVersion, mfa: { verifiedAt: row.verifiedAt.getTime(), version: row.mfaVersion } },
      ...(row.ipBucketKey && row.loginBucketKey ? { reservation: { allowed: true, delayMs: 0, keys: [{ dimension: "IP", bucketKey: row.ipBucketKey }, { dimension: "LOGIN_ID", bucketKey: row.loginBucketKey }] } } : {}) };
  });
}

/** A recovery code grants re-enrollment only, never an administrative session. */
export async function recoverMfaChallenge(database: Database, token: string | null, recoveryCode: string) {
  return inChallenge(database, token, async (tx, row, now) => {
    const profile = row.profile, staff = profile.staff;
    if (row.kind !== "VERIFY") return { status: "INVALID" as const };
    if (!await attempt(tx, profile, now)) return { status: "LIMITED" as const };
    const hash = matchingRecoveryHash(recoveryCode, profile.recoveryCodeHashes, profile);
    if (!hash) return failed(tx, profile, "recovery");
    const next = await tx.staffMfa.update({ where: { staffId: staff.id }, data: { recoveryCodeHashes: profile.recoveryCodeHashes.filter(value => value !== hash), secretCiphertext: null, lastAcceptedStep: null, version: { increment: 1 }, failedAttempts: 0, failureWindowStartedAt: now } });
    const sessionVersion = await nextSessionVersion(tx, { id: staff.id, storeId: staff.storeId, role: staff.role, sessionVersion: staff.sessionVersion });
    await tx.staffMfaChallenge.update({ where: { id: row.id }, data: { consumedAt: now, secretCiphertext: null } });
    await recordAuditLog({ storeId: staff.storeId, actorStaffId: staff.id, action: "STAFF_MFA_RECOVERY_USED", entityType: "StaffMfa", entityId: staff.id }, tx);
    return createChallenge(tx, { id: staff.id, storeId: staff.storeId, role: staff.role, sessionVersion }, next, "REPLACE", now,
      row.ipBucketKey && row.loginBucketKey ? { allowed: true, delayMs: 0, keys: [{ dimension: "IP", bucketKey: row.ipBucketKey }, { dimension: "LOGIN_ID", bucketKey: row.loginBucketKey }] } : undefined);
  });
}

/** Replacing an enrolled factor requires both the password and a fresh existing factor. */
export async function beginMfaReplacement(database: Database, actor: MfaActor, password: string, code: string) {
  mfaEncryptionKey();
  return database.$transaction(async tx => {
    await lockStore(tx, actor.storeId, actor.id);
    const staff = await tx.staff.findFirst({ where: { id: actor.id, storeId: actor.storeId, isActive: true, role: actor.role, sessionVersion: actor.sessionVersion, store: { isActive: true } } });
    const profile = await tx.staffMfa.findUnique({ where: { staffId: actor.id } }), now = await clock(tx);
    if (!staff || !requiresStaffMfa(staff.role) || !profile?.enabledAt || !profile.secretCiphertext) return { status: "INVALID" as const };
    if (!await attempt(tx, profile, now)) return { status: "LIMITED" as const };
    const passwordMatches = password.length > 0 && Buffer.byteLength(password, "utf8") <= 72 && await verifyPassword(password, staff.passwordHash);
    const step = passwordMatches ? await verifyTotp(decryptMfaSecret(profile.secretCiphertext, context(profile, "active:" + profile.version)), code, now, profile.lastAcceptedStep) : null;
    if (step === null) return failed(tx, profile, "replacement");
    await tx.staffMfa.update({ where: { staffId: staff.id }, data: { lastAcceptedStep: step, failedAttempts: 0, failureWindowStartedAt: now } });
    const sessionVersion = await nextSessionVersion(tx, actor);
    await recordAuditLog({ storeId: staff.storeId, actorStaffId: staff.id, action: "STAFF_MFA_REPLACEMENT_STARTED", entityType: "StaffMfa", entityId: staff.id }, tx);
    return createChallenge(tx, { ...actor, sessionVersion }, profile, "REPLACE", now);
  }, { maxWait: 10000, timeout: 20000 });
}

export async function cancelMfaChallenge(database: Database, token: string | null): Promise<void> {
  await inChallenge(database, token, async (tx, row, now) => { await tx.staffMfaChallenge.update({ where: { id: row.id }, data: { consumedAt: now, secretCiphertext: null, recoveryCiphertext: null } }); });
}
