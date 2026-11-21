import "server-only";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport } from "@simplewebauthn/server";
import { Prisma, type PrismaClient, type CustomerAuthChallenge } from "@prisma/client";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { recordAuditLog } from "@/lib/audit-log";
import { applicationSqlTable } from "@/lib/security/sql-namespace";
import { hashAuthToken, isAuthToken } from "./auth-tokens";
import { MemberAuthError, portalConfig } from "./portal-config";
import { createPortalToken, hashPortalValue, newRecoveryCode, normalizedRecoveryCode, portalTokenSchema, validWebAuthnEnvelope, sameUserHandle, credentialLabelSchema, PORTAL_POLICY } from "./portal-policy";
import { issueMemberSession, readMemberSession, requireMemberSession } from "./portal-session";

const subjectKey = (subject: { storeId: string; customerId: string }) => ({ storeId_customerId: { storeId: subject.storeId, customerId: subject.customerId } });
const usableIdentity = { store: { isActive: true }, customer: { isActive: true, participantStaffId: null } };
const transactionOptions = { maxWait: 10_000, timeout: 30_000 };
function fail(): never { throw new MemberAuthError(); }
async function identity(tx: Prisma.TransactionClient, subject: { storeId: string; customerId: string }, active = true) {
  const row = await tx.customerAuthIdentity.findFirst({ where: { ...subjectKey(subject).storeId_customerId, ...usableIdentity, ...(active ? { activatedAt: { not: null } } : {}) } });
  if (!row) fail(); return row;
}
async function challenge(tx: Prisma.TransactionClient, token: unknown, now = new Date()) {
  if (!portalTokenSchema.safeParse(token).success) fail();
  const row = await tx.customerAuthChallenge.findUnique({ where: { tokenHash: hashPortalValue("challenge", token as string) } });
  if (!row || row.usedAt || row.expiresAt <= now) fail(); return row;
}
async function consume(tx: Prisma.TransactionClient, row: CustomerAuthChallenge, now: Date) {
  if ((await tx.customerAuthChallenge.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })).count !== 1) fail();
}
async function saveChallenge(tx: Prisma.TransactionClient, data: Pick<Prisma.CustomerAuthChallengeUncheckedCreateInput, "kind" | "challenge" | "storeId" | "customerId" | "authVersion" | "pairingId" | "recoveryCodeId">) {
  const token = createPortalToken(), config = portalConfig(), expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);
  await tx.customerAuthChallenge.create({ data: { ...data, tokenHash: hashPortalValue("challenge", token), expiresAt } }); return { token, expiresAt };
}
async function confirmedPair(tx: Prisma.TransactionClient, claim: unknown, expectedId?: string) {
  if (!isAuthToken(claim)) fail();
  const pair = await tx.customerPairing.findUnique({ where: { claimHash: hashAuthToken(claim) } });
  if (!pair || (expectedId && pair.id !== expectedId) || pair.cancelledAt || pair.completedAt || !pair.claimedAt || !pair.staffConfirmedAt || !pair.customerConfirmedAt || pair.expiresAt.getTime() <= Date.now()) fail();
  return pair;
}
async function recovery(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.customerRecoveryCode.findUnique({ where: { id }, include: { identity: { select: { recoveryVersion: true } } } });
  if (!row || row.usedAt || row.revokedAt || row.generation !== row.identity.recoveryVersion) fail(); return row;
}
async function rotateRecovery(tx: Prisma.TransactionClient, subject: { storeId: string; customerId: string }, now: Date) {
  const updated = await tx.customerAuthIdentity.update({ where: subjectKey(subject), data: { recoveryVersion: { increment: 1 }, recoveryAcknowledgedAt: null } });
  await tx.customerRecoveryCode.updateMany({ where: { ...subjectKey(subject).storeId_customerId, revokedAt: null }, data: { revokedAt: now } });
  const codes = Array.from({ length: portalConfig().recoveryCodeCount }, () => newRecoveryCode());
  await tx.customerRecoveryCode.createMany({ data: codes.map(code => ({ ...subjectKey(subject).storeId_customerId, codeHash: hashPortalValue("recovery", normalizedRecoveryCode(code)!), generation: updated.recoveryVersion })) });
  await recordAuditLog({ storeId: subject.storeId, action: "MEMBER_RECOVERY_CODES_ROTATED", entityType: "CustomerAuthIdentity", entityId: updated.id, metadata: { generation: updated.recoveryVersion } }, tx);
  return { codes, generation: updated.recoveryVersion };
}

/** Shared across options and verification, before credential lookup or expensive cryptography. */
export async function reserveMemberAttempt(database: PrismaClient, address: string, now = new Date()) {
  portalConfig(); const bucketKey = hashPortalValue("rate", address || "unknown");
  return database.$transaction(async tx => {
    await tx.loginAttemptBucket.createMany({ data: [{ bucketKey, dimension: "IP", failureCount: 0, windowStartedAt: now }], skipDuplicates: true });
    const rows = await tx.$queryRaw<Array<{ failureCount: number; windowStartedAt: Date }>>`SELECT "failureCount", "windowStartedAt" FROM ${applicationSqlTable("LoginAttemptBucket")} WHERE "bucketKey" = ${bucketKey} FOR UPDATE`;
    if (rows.length !== 1) fail();
    const stale = now.getTime() - rows[0].windowStartedAt.getTime() >= 60_000, count = stale ? 0 : rows[0].failureCount;
    if (count >= PORTAL_POLICY.publicRequestsPerMinute) return false;
    await tx.loginAttemptBucket.update({ where: { bucketKey }, data: { failureCount: count + 1, ...(stale ? { windowStartedAt: now } : {}) } }); return true;
  });
}
export async function beginMemberLogin(database: PrismaClient) {
  const config = portalConfig(), options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: "required", timeout: config.challengeTtlSeconds * 1000 });
  const saved = await database.$transaction(tx => saveChallenge(tx, { kind: "LOGIN", challenge: options.challenge })); return { ...saved, options };
}
export async function beginMemberRegistration(database: PrismaClient, kind: "ENROLL" | "ADD" | "RECOVER", proof: unknown) {
  const config = portalConfig();
  return database.$transaction(async tx => {
    let subject: { storeId: string; customerId: string }, pairingId: string | undefined, recoveryCodeId: string | undefined;
    if (kind === "ENROLL") { const p = await confirmedPair(tx, proof); subject = p; pairingId = p.id; }
    else if (kind === "ADD") subject = await requireMemberSession(tx, proof, true);
    else {
      const code = normalizedRecoveryCode(proof); if (!code) fail();
      const found = await tx.customerRecoveryCode.findUnique({ where: { codeHash: hashPortalValue("recovery", code) } });
      if (!found) fail(); await recovery(tx, found.id); subject = found; recoveryCodeId = found.id;
    }
    await lockBusinessStore(tx, subject.storeId); const owner = await identity(tx, subject, kind !== "ENROLL");
    if (kind === "ENROLL" && owner.activatedAt) fail();
    const keys = await tx.customerPasskey.findMany({ where: { ...subjectKey(subject).storeId_customerId, revokedAt: null }, select: { credentialId: true, transports: true } });
    if (kind === "ADD" && keys.length >= config.maxCredentials) fail();
    const options = await generateRegistrationOptions({ rpName: config.rpName, rpID: config.rpId, userID: new TextEncoder().encode(owner.userHandle), userName: `会員 ${owner.userHandle.slice(0, 8)}`, userDisplayName: "麻雀ウェーブ会員", attestationType: "none", supportedAlgorithmIDs: [-7, -257], authenticatorSelection: { residentKey: "required", userVerification: "required" }, excludeCredentials: keys.map(k => ({ id: k.credentialId, transports: k.transports as AuthenticatorTransport[] })), timeout: config.challengeTtlSeconds * 1000 });
    const saved = await saveChallenge(tx, { kind, challenge: options.challenge, ...subjectKey(subject).storeId_customerId, authVersion: owner.authVersion, pairingId, recoveryCodeId });
    return { ...saved, options };
  }, transactionOptions);
}
export async function finishMemberLogin(database: PrismaClient, nonce: unknown, raw: unknown, previousSession?: string) {
  const config = portalConfig(); if (!validWebAuthnEnvelope(raw, false)) fail(); const response = raw as AuthenticationResponseJSON;
  const request = await challenge(database, nonce); if (request.kind !== "LOGIN") fail();
  const key = await database.customerPasskey.findUnique({ where: { credentialId: response.id }, include: { identity: true } });
  if (!key || key.revokedAt || !sameUserHandle(response.response.userHandle, key.identity.userHandle) || !Number.isSafeInteger(Number(key.counter))) fail();
  const verified = await verifyAuthenticationResponse({ response, expectedChallenge: request.challenge, expectedOrigin: config.origin, expectedRPID: config.rpId, requireUserVerification: true, credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports as AuthenticatorTransport[] } });
  if (!verified.verified) fail();
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, key.storeId); const now = new Date(), owner = await identity(tx, key), current = await tx.customerPasskey.findUnique({ where: { id: key.id } });
    if (!current || current.revokedAt || current.counter !== key.counter || owner.authVersion !== key.identity.authVersion) fail();
    const previous = await readMemberSession(tx, previousSession); if (previous && (previous.customerId !== key.customerId || previous.storeId !== key.storeId)) fail();
    await consume(tx, request, now);
    await tx.customerPasskey.update({ where: { id: key.id }, data: { counter: BigInt(verified.authenticationInfo.newCounter), lastUsedAt: now } });
    if (previous) await tx.customerPortalSession.update({ where: { id: previous.sessionId }, data: { revokedAt: now } });
    return issueMemberSession(tx, owner, !owner.recoveryAcknowledgedAt, now);
  }, transactionOptions);
}
export async function finishMemberRegistration(database: PrismaClient, nonce: unknown, raw: unknown, label: unknown, proof: unknown, previousSession?: string) {
  const config = portalConfig(); if (!validWebAuthnEnvelope(raw, true)) fail(); const parsedLabel = credentialLabelSchema.parse(label), response = raw as RegistrationResponseJSON;
  const request = await challenge(database, nonce); if (!request.storeId || !request.customerId || !["ENROLL", "ADD", "RECOVER"].includes(request.kind)) fail();
  const verified = await verifyRegistrationResponse({ response, expectedChallenge: request.challenge, expectedOrigin: config.origin, expectedRPID: config.rpId, requireUserVerification: true });
  if (!verified.verified || !verified.registrationInfo) fail(); const info = verified.registrationInfo;
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, request.storeId!); const now = new Date(), subject = { storeId: request.storeId!, customerId: request.customerId! };
    let owner = await identity(tx, subject, request.kind !== "ENROLL"); if (owner.authVersion !== request.authVersion) fail();
    const prior = await readMemberSession(tx, previousSession); if (prior && (prior.storeId !== owner.storeId || prior.customerId !== owner.customerId)) fail();
    if (request.kind === "ENROLL") {
      if (owner.activatedAt) fail(); await confirmedPair(tx, proof, request.pairingId ?? undefined);
      await tx.customerPairing.update({ where: { id: request.pairingId! }, data: { completedAt: now } });
      owner = await tx.customerAuthIdentity.update({ where: subjectKey(subject), data: { activatedAt: now } });
    } else if (request.kind === "ADD") {
      const signedIn = await requireMemberSession(tx, proof, true); if (signedIn.storeId !== owner.storeId || signedIn.customerId !== owner.customerId) fail();
      if (await tx.customerPasskey.count({ where: { ...subject, revokedAt: null } }) >= config.maxCredentials) fail();
    } else {
      const code = await recovery(tx, request.recoveryCodeId!); if (code.storeId !== owner.storeId || code.customerId !== owner.customerId) fail();
      await tx.customerRecoveryCode.update({ where: { id: code.id }, data: { usedAt: now } });
      await tx.customerPasskey.updateMany({ where: { ...subject, revokedAt: null }, data: { revokedAt: now } });
      await tx.customerPortalSession.updateMany({ where: { ...subject, revokedAt: null }, data: { revokedAt: now } });
      owner = await tx.customerAuthIdentity.update({ where: subjectKey(subject), data: { authVersion: { increment: 1 } } });
    }
    await consume(tx, request, now);
    await tx.customerPasskey.create({ data: { ...subject, credentialId: info.credential.id, publicKey: Buffer.from(info.credential.publicKey), counter: BigInt(info.credential.counter), transports: info.credential.transports ?? [], deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp, label: parsedLabel } });
    const codes = request.kind === "ADD" ? null : await rotateRecovery(tx, owner, now);
    await recordAuditLog({ storeId: owner.storeId, action: `MEMBER_PASSKEY_${request.kind}`, entityType: "CustomerAuthIdentity", entityId: owner.id }, tx);
    const session = request.kind === "ADD" ? null : await issueMemberSession(tx, owner, true, now);
    return { session, recovery: codes };
  }, transactionOptions);
}
export async function regenerateMemberRecovery(database: PrismaClient, token: unknown) {
  portalConfig(); return database.$transaction(async tx => { const first = await requireMemberSession(tx, token, true); await lockBusinessStore(tx, first.storeId); const current = await requireMemberSession(tx, token, true); return rotateRecovery(tx, current, new Date()); }, transactionOptions);
}
export async function acknowledgeMemberRecovery(database: PrismaClient, token: unknown, generation: number) {
  portalConfig(); if (!Number.isInteger(generation) || generation < 1) fail();
  await database.$transaction(async tx => {
    const first = await requireMemberSession(tx, token); await lockBusinessStore(tx, first.storeId); const current = await requireMemberSession(tx, token), owner = await identity(tx, current);
    if (owner.recoveryVersion !== generation) fail(); if (owner.recoveryAcknowledgedAt) return;
    const now = new Date(); await tx.customerAuthIdentity.update({ where: subjectKey(current), data: { recoveryAcknowledgedAt: now } });
    await tx.customerPortalSession.update({ where: { id: current.sessionId }, data: { recoveryAcknowledgedAt: now } });
    await recordAuditLog({ storeId: current.storeId, action: "MEMBER_RECOVERY_ACKNOWLEDGED", entityType: "CustomerAuthIdentity", entityId: owner.id, metadata: { generation } }, tx);
  }, transactionOptions);
}
export async function removeMemberPasskey(database: PrismaClient, token: unknown, id: unknown) {
  portalConfig(); if (typeof id !== "string" || id.length > 200) fail();
  await database.$transaction(async tx => {
    const first = await requireMemberSession(tx, token, true); await lockBusinessStore(tx, first.storeId); const current = await requireMemberSession(tx, token, true), where = { ...subjectKey(current).storeId_customerId, revokedAt: null };
    if (await tx.customerPasskey.count({ where }) <= 1) fail();
    if ((await tx.customerPasskey.updateMany({ where: { ...where, id }, data: { revokedAt: new Date() } })).count !== 1) fail();
    await recordAuditLog({ storeId: current.storeId, action: "MEMBER_PASSKEY_REMOVED", entityType: "CustomerPasskey", entityId: id }, tx);
  }, transactionOptions);
}
