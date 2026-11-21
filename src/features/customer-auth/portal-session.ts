import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { PORTAL_POLICY, createPortalToken, hashPortalValue, portalTokenSchema } from "./portal-policy";
import { MemberAuthError, portalConfig } from "./portal-config";
type SessionDatabase = Pick<PrismaClient, "customerPortalSession">;
export type MemberSubject = { sessionId: string; storeId: string; customerId: string; authVersion: number; authenticatedAt: Date; expiresAt: Date; recoveryAcknowledged: boolean };
export async function readMemberSession(database: SessionDatabase, token: unknown, now = new Date()): Promise<MemberSubject | null> {
  portalConfig();
  if (!portalTokenSchema.safeParse(token).success) return null;
  const row = await database.customerPortalSession.findUnique({ where: { tokenHash: hashPortalValue("session", token as string) }, include: { store: { select: { isActive: true } }, identity: { select: { activatedAt: true, authVersion: true, recoveryAcknowledgedAt: true, customer: { select: { isActive: true, participantStaffId: true } } } } } });
  if (!row || row.revokedAt || row.expiresAt <= now || !row.store.isActive || !row.identity.activatedAt || row.authVersion !== row.identity.authVersion || !row.identity.customer.isActive || row.identity.customer.participantStaffId) return null;
  return { sessionId: row.id, storeId: row.storeId, customerId: row.customerId, authVersion: row.authVersion, authenticatedAt: row.authenticatedAt, expiresAt: row.expiresAt, recoveryAcknowledged: Boolean(row.identity.recoveryAcknowledgedAt) };
}
export async function requireMemberSession(database: SessionDatabase, token: unknown, fresh = false, now = new Date()): Promise<MemberSubject> {
  const subject = await readMemberSession(database, token, now), config = portalConfig();
  if (!subject || (fresh && (now.getTime() - subject.authenticatedAt.getTime() > config.stepUpTtlSeconds * 1000 || subject.authenticatedAt.getTime() > now.getTime() + 30000))) throw new MemberAuthError();
  return subject;
}
export async function issueMemberSession(tx: Prisma.TransactionClient, identity: { storeId: string; customerId: string; authVersion: number }, showRecovery: boolean, now = new Date()) {
  const config = portalConfig(), token = createPortalToken(), expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000);
  const old = await tx.customerPortalSession.findMany({ where: { storeId: identity.storeId, customerId: identity.customerId, revokedAt: null, expiresAt: { gt: now } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: PORTAL_POLICY.sessionMaximum - 1, select: { id: true } });
  if (old.length) await tx.customerPortalSession.updateMany({ where: { storeId: identity.storeId, customerId: identity.customerId, id: { in: old.map(s => s.id) } }, data: { revokedAt: now } });
  const session = await tx.customerPortalSession.create({ data: { storeId: identity.storeId, customerId: identity.customerId, authVersion: identity.authVersion, tokenHash: hashPortalValue("session", token), authenticatedAt: now, createdAt: now, expiresAt, recoveryAcknowledgedAt: showRecovery ? null : now }, select: { id: true } });
  await recordAuditLog({ storeId: identity.storeId, action: "MEMBER_LOGIN", entityType: "CustomerAuthIdentity", entityId: identity.customerId, metadata: { sessionId: session.id, prunedSessions: old.length } }, tx);
  return { token, expiresAt };
}
export async function revokeMemberSessions(database: PrismaClient, token: unknown, all = false, now = new Date()) {
  portalConfig(); const initial = await readMemberSession(database, token, now); if (!initial) return;
  await database.$transaction(async tx => {
    await lockBusinessStore(tx, initial.storeId); const current = await requireMemberSession(tx, token, false, now);
    if (all) { await tx.customerAuthIdentity.update({ where: { storeId_customerId: { storeId: current.storeId, customerId: current.customerId } }, data: { authVersion: { increment: 1 } } }); await tx.customerPortalSession.updateMany({ where: { storeId: current.storeId, customerId: current.customerId, revokedAt: null }, data: { revokedAt: now } }); }
    else await tx.customerPortalSession.update({ where: { id: current.sessionId }, data: { revokedAt: now } });
    await recordAuditLog({ storeId: current.storeId, action: all ? "MEMBER_LOGOUT_ALL" : "MEMBER_LOGOUT", entityType: "CustomerAuthIdentity", entityId: current.customerId }, tx);
  });
}
