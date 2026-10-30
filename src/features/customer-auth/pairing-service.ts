import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { CustomerPairing, Prisma, PrismaClient } from "@prisma/client";
import { getCustomerAuthConfig } from "./auth-config";
import { createAuthToken, hashAuthToken, isAuthToken } from "./auth-tokens";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { recordAuditLog } from "@/lib/audit-log";

type Database = Pick<PrismaClient, "$transaction">;
type Context = { storeId: string; staffId: string };
export class CustomerLinkError extends Error { constructor() { super("スマホ連携を確認できません。店員に新しいQRの発行を依頼してください。"); } }
export class CustomerLinkRateError extends CustomerLinkError {}
export type CustomerLinkState = { state: "INVALID" | "CONFIRM" | "READY"; confirmationCode?: string; customerConfirmed?: boolean; staffConfirmed?: boolean };
function config() { const value = getCustomerAuthConfig(); if (!value) throw new CustomerLinkError(); return value; }
async function staff(tx: Prisma.TransactionClient, context: Context) {
  if (!await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true, store: { isActive: true } }, select: { id: true } })) throw new CustomerLinkError();
}
async function eligibleCustomer(tx: Prisma.TransactionClient, storeId: string, customerId: string) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, storeId, isActive: true, participantStaffId: null }, select: { id: true, authIdentity: { select: { activatedAt: true } } } });
  if (!customer || customer.authIdentity?.activatedAt) throw new CustomerLinkError();
}
async function lockedPair(tx: Prisma.TransactionClient, id: string, storeId: string) {
  await lockBusinessStore(tx, storeId);
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CustomerPairing" WHERE "id" = ${id} AND "storeId" = ${storeId} FOR UPDATE`;
  if (locked.length !== 1) throw new CustomerLinkError();
  const row = await tx.customerPairing.findFirst({ where: { id, storeId } });
  if (!row) throw new CustomerLinkError();
  return row;
}
function valid(row: CustomerPairing) { return !row.cancelledAt && !row.completedAt && row.expiresAt.getTime() > Date.now(); }
function publicState(row: CustomerPairing): CustomerLinkState {
  if (!valid(row) || !row.claimedAt || !row.confirmationCode) return { state: "INVALID" };
  return { state: row.staffConfirmedAt && row.customerConfirmedAt ? "READY" : "CONFIRM", confirmationCode: row.confirmationCode, staffConfirmed: Boolean(row.staffConfirmedAt), customerConfirmed: Boolean(row.customerConfirmedAt) };
}
export async function issueCustomerPairing(database: Database, raw: { customerId: string; requestKey: string }, context: Context) {
  const settings = config(), input = z.object({ customerId: z.string().min(1).max(200), requestKey: z.uuid().transform((value) => value.toLowerCase()) }).parse(raw);
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId); await staff(tx, context); await eligibleCustomer(tx, context.storeId, input.customerId);
    const replay = await tx.customerPairing.findFirst({ where: { storeId: context.storeId, requestKey: input.requestKey } });
    if (replay) {
      if (replay.customerId !== input.customerId || replay.issuedByStaffId !== context.staffId) throw new CustomerLinkError();
      return { pairingId: replay.id, token: null, expiresAt: replay.expiresAt };
    }
    const now = new Date();
    if (await tx.customerPairing.count({ where: { storeId: context.storeId, issuedByStaffId: context.staffId, createdAt: { gte: new Date(now.getTime() - 60_000) } } }) >= 10) throw new CustomerLinkRateError();
    await tx.customerAuthIdentity.upsert({ where: { storeId_customerId: { storeId: context.storeId, customerId: input.customerId } }, create: { storeId: context.storeId, customerId: input.customerId }, update: {} });
    await tx.customerPairing.updateMany({ where: { storeId: context.storeId, customerId: input.customerId, cancelledAt: null, completedAt: null }, data: { cancelledAt: now } });
    const token = createAuthToken();
    const row = await tx.customerPairing.create({ data: { storeId: context.storeId, customerId: input.customerId, issuedByStaffId: context.staffId, requestKey: input.requestKey, tokenHash: hashAuthToken(token), createdAt: now, expiresAt: new Date(now.getTime() + settings.pairingTtlSeconds * 1000) } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_LINK_ISSUED", entityType: "CustomerPairing", entityId: row.id, metadata: { customerId: input.customerId } }, tx);
    return { pairingId: row.id, token, expiresAt: row.expiresAt };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function claimCustomerPairing(database: Database, token: unknown, claimToken: unknown): Promise<CustomerLinkState> {
  config(); if (!isAuthToken(token) || !isAuthToken(claimToken)) return { state: "INVALID" };
  return database.$transaction(async (tx) => {
    const found = await tx.customerPairing.findUnique({ where: { tokenHash: hashAuthToken(token) }, select: { id: true, storeId: true } });
    if (!found) return { state: "INVALID" };
    const row = await lockedPair(tx, found.id, found.storeId);
    if (!valid(row)) return { state: "INVALID" };
    await eligibleCustomer(tx, row.storeId, row.customerId);
    const claimHash = hashAuthToken(claimToken);
    if (row.claimHash && row.claimHash !== claimHash) {
      const failedClaims = row.failedClaims + 1;
      await tx.customerPairing.update({ where: { id: row.id }, data: { failedClaims, ...(failedClaims >= 5 ? { cancelledAt: new Date() } : {}) } });
      if (failedClaims >= 5) await recordAuditLog({ storeId: row.storeId, action: "CUSTOMER_LINK_INVALIDATED", entityType: "CustomerPairing", entityId: row.id, metadata: { reason: "claim-attempt-limit" } }, tx);
      return { state: "INVALID" };
    }
    if (row.claimHash) return publicState(row);
    const updated = await tx.customerPairing.update({ where: { id: row.id }, data: { claimHash, claimedAt: new Date(), confirmationCode: randomInt(100000, 1000000).toString() } });
    await recordAuditLog({ storeId: row.storeId, action: "CUSTOMER_LINK_CLAIMED", entityType: "CustomerPairing", entityId: row.id }, tx);
    return publicState(updated);
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function confirmCustomerPairing(database: Database, claimToken: unknown): Promise<CustomerLinkState> {
  config(); if (!isAuthToken(claimToken)) throw new CustomerLinkError();
  return database.$transaction(async (tx) => {
    const found = await tx.customerPairing.findUnique({ where: { claimHash: hashAuthToken(claimToken) }, select: { id: true, storeId: true } });
    if (!found) throw new CustomerLinkError();
    const row = await lockedPair(tx, found.id, found.storeId);
    if (!valid(row) || !row.claimedAt || row.claimHash !== hashAuthToken(claimToken)) throw new CustomerLinkError();
    await eligibleCustomer(tx, row.storeId, row.customerId);
    if (row.customerConfirmedAt) return publicState(row);
    const updated = await tx.customerPairing.update({ where: { id: row.id }, data: { customerConfirmedAt: new Date() } });
    await recordAuditLog({ storeId: row.storeId, action: "CUSTOMER_LINK_CUSTOMER_CONFIRMED", entityType: "CustomerPairing", entityId: row.id }, tx);
    return publicState(updated);
  }, { maxWait: 10_000, timeout: 30_000 });
}
export async function confirmStaffPairing(database: Database, pairingId: string, customerId: string, context: Context) {
  config(); if (!pairingId || pairingId.length > 200) throw new CustomerLinkError();
  return database.$transaction(async (tx) => {
    const row = await lockedPair(tx, pairingId, context.storeId); await staff(tx, context);
    if (!valid(row) || !row.claimedAt || row.customerId !== customerId) throw new CustomerLinkError();
    await eligibleCustomer(tx, row.storeId, row.customerId);
    if (!row.staffConfirmedAt) {
      await tx.customerPairing.update({ where: { id: row.id }, data: { staffConfirmedAt: new Date(), confirmedByStaffId: context.staffId } });
      await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_LINK_STAFF_CONFIRMED", entityType: "CustomerPairing", entityId: row.id }, tx);
    }
  }, { maxWait: 10_000, timeout: 30_000 });
}
export async function cancelCustomerPairing(database: Database, pairingId: string, customerId: string, context: Context) {
  config(); if (!pairingId || pairingId.length > 200) throw new CustomerLinkError();
  return database.$transaction(async (tx) => {
    const row = await lockedPair(tx, pairingId, context.storeId); await staff(tx, context);
    if (row.completedAt || row.customerId !== customerId) throw new CustomerLinkError();
    if (!row.cancelledAt) {
      await tx.customerPairing.update({ where: { id: row.id }, data: { cancelledAt: new Date() } });
      await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_LINK_CANCELLED", entityType: "CustomerPairing", entityId: row.id }, tx);
    }
  });
}
export async function readClaimedPairing(database: Database, claimToken: unknown): Promise<CustomerLinkState> {
  config(); if (!isAuthToken(claimToken)) return { state: "INVALID" };
  return database.$transaction(async (tx) => {
    const row = await tx.customerPairing.findFirst({ where: { claimHash: hashAuthToken(claimToken), store: { isActive: true }, customer: { isActive: true, participantStaffId: null }, identity: { activatedAt: null } } });
    return row ? publicState(row) : { state: "INVALID" };
  });
}
export async function getStaffPairingData(database: Database, customerId: string, context: Context) {
  config();
  return database.$transaction(async (tx) => {
    await staff(tx, context);
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId: context.storeId, participantStaffId: null }, select: { id: true, internalName: true, customerCode: true, isActive: true, authIdentity: { select: { activatedAt: true } } } });
    if (!customer) return null;
    const row = await tx.customerPairing.findFirst({ where: { storeId: context.storeId, customerId }, orderBy: { createdAt: "desc" } });
    return { customer, pairing: row ? { id: row.id, expiresAt: row.expiresAt, usable: valid(row), state: publicState(row), cancelled: Boolean(row.cancelledAt), completed: Boolean(row.completedAt), claimed: Boolean(row.claimedAt) } : null };
  }, { isolationLevel: "RepeatableRead" });
}
