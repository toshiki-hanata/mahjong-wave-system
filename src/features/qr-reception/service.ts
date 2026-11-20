import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { lockBusinessStore, requireOpenBusinessDay } from "@/features/business-days/business-day-service";
import { checkInVisitInTransaction } from "@/features/visits/visit-service";
import { nextReceptionCode } from "@/features/visits/reception-service";
import { receptionNameKey } from "@/features/visits/reception-schemas";
import { recordAuditLog } from "@/lib/audit-log";
import { applicationSqlTable } from "@/lib/security/sql-namespace";
import { QR_RECEPTION_POLICY as policy, validStationKey, validReceptionToken, receiptHash, receptionRateKey, submissionSchema, reviewSchema, receptionNameSchema, type ReceptionReview } from "./policy";

type Database = Pick<PrismaClient, "$transaction">;
type Context = { storeId: string; staffId: string; sessionVersion?: number };
export class QrReceptionError extends Error {}
const unavailable = () => new QrReceptionError("受付を確認できません。店員にお声がけください。");
async function actor(tx: Prisma.TransactionClient, context: Context) {
  const staff = await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true }, select: { sessionVersion: true } });
  if (!staff || (context.sessionVersion !== undefined && staff.sessionVersion !== context.sessionVersion)) throw unavailable();
}
async function activeStation(tx: Prisma.TransactionClient, storeId: string, key: string, secret: string) {
  const setting = await tx.qrReceptionSetting.findUnique({ where: { storeId } });
  if (!setting?.enabled || !validStationKey(storeId, setting.revision, key, secret)) throw unavailable();
  return setting;
}

export async function updateReceptionSetting(database: Database, mode: "enable" | "disable" | "rotate", context: Context) {
  if (!["enable", "disable", "rotate"].includes(mode)) throw unavailable();
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, context.storeId); await actor(tx, context);
    const current = await tx.qrReceptionSetting.findUnique({ where: { storeId: context.storeId } });
    const setting = await tx.qrReceptionSetting.upsert({ where: { storeId: context.storeId }, create: { storeId: context.storeId, enabled: mode !== "disable", revision: 1 }, update: { enabled: mode !== "disable", revision: current && (mode === "rotate" || mode === "disable" || !current.enabled) ? current.revision + 1 : current?.revision ?? 1 } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "QR_RECEPTION_SETTING", entityType: "QrReceptionSetting", entityId: context.storeId, metadata: { mode, revision: setting.revision } }, tx);
    return setting;
  });
}

async function reservePublicAttempt(tx: Prisma.TransactionClient, storeId: string, address: string, secret: string, now: Date) {
  const bucketKey = receptionRateKey(storeId, address, secret);
  await tx.loginAttemptBucket.createMany({ data: [{ bucketKey, dimension: "IP", failureCount: 0, windowStartedAt: now }], skipDuplicates: true });
  const [row] = await tx.$queryRaw<Array<{ failureCount: number; windowStartedAt: Date }>>`SELECT "failureCount", "windowStartedAt" FROM ${applicationSqlTable("LoginAttemptBucket")} WHERE "bucketKey" = ${bucketKey} FOR UPDATE`;
  if (!row) throw unavailable();
  const fresh = row.windowStartedAt.getTime() > now.getTime() - policy.ipWindowMs;
  if (fresh && row.failureCount >= policy.ipMaximum) return false;
  await tx.loginAttemptBucket.update({ where: { bucketKey }, data: { failureCount: fresh ? row.failureCount + 1 : 1, windowStartedAt: fresh ? row.windowStartedAt : now } });
  return true;
}

export async function submitReceptionRequest(database: Database, storeId: string, key: string, raw: { name: string; token: string }, secret: string, address: string, now = new Date()) {
  const input = submissionSchema.parse(raw);
  if (!validReceptionToken(storeId, key, input.token, secret, policy.formMs, now)) throw new QrReceptionError("画面の有効期限が切れました。QRを読み取り直してください。");
  const outcome = await database.$transaction(async tx => {
    const day = await requireOpenBusinessDay(tx, storeId);
    const setting = await activeStation(tx, storeId, key, secret);
    const hash = receiptHash(input.token);
    const replay = await tx.qrReceptionRequest.findUnique({ where: { tokenHash: hash } });
    if (replay) {
      if (replay.storeId !== storeId || replay.submittedName !== input.name || replay.businessDayId !== day.id) throw unavailable();
      return { accepted: true, receiptCode: replay.receiptCode };
    }
    if (!await reservePublicAttempt(tx, storeId, address, secret, now)) return { accepted: false, receiptCode: "" };
    const recent = await tx.qrReceptionRequest.count({ where: { storeId, createdAt: { gte: new Date(now.getTime() - policy.ipWindowMs) } } });
    const pending = await tx.qrReceptionRequest.count({ where: { storeId, status: "PENDING", expiresAt: { gt: now }, businessDayId: day.id } });
    if (recent >= policy.storeMaximum || pending >= policy.pendingMaximum) return { accepted: false, receiptCode: "" };
    let receiptCode = "";
    for (let i = 0; i < 5; i++) { const candidate = randomBytes(4).toString("hex").toUpperCase(); if (!await tx.qrReceptionRequest.findFirst({ where: { businessDayId: day.id, receiptCode: candidate }, select: { id: true } })) { receiptCode = candidate; break; } }
    if (!receiptCode) throw unavailable();
    const created = await tx.qrReceptionRequest.create({ data: { storeId, businessDayId: day.id, stationRevision: setting.revision, tokenHash: hash, submittedName: input.name, receiptCode, createdAt: now, expiresAt: new Date(now.getTime() + policy.pendingMs) }, select: { id: true } });
    await recordAuditLog({ storeId, action: "QR_RECEPTION_SUBMIT", entityType: "QrReceptionRequest", entityId: created.id }, tx);
    return { accepted: true, receiptCode };
  }, { maxWait: 10000, timeout: 20000 });
  if (!outcome.accepted) throw new QrReceptionError("申請が続いています。少し待つか、店員にお声がけください。");
  return { receiptCode: outcome.receiptCode };
}

export async function approveReceptionRequest(database: Database, raw: ReceptionReview, context: Context, now = new Date()) {
  const input = reviewSchema.parse(raw);
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, context.storeId); await actor(tx, context);
    const request = await tx.qrReceptionRequest.findFirst({ where: { id: input.requestId, storeId: context.storeId } });
    if (!request) throw unavailable();
    if (request.status === "APPROVED") {
      if (input.mode === "existing" && input.customerId !== request.customerId) throw unavailable();
      return { replayed: true, visitId: request.visitId };
    }
    const day = await requireOpenBusinessDay(tx, context.storeId);
    const setting = await tx.qrReceptionSetting.findUnique({ where: { storeId: context.storeId } });
    if (request.status !== "PENDING" || request.expiresAt <= now || request.businessDayId !== day.id || !setting?.enabled || setting.revision !== request.stationRevision) throw new QrReceptionError("この申請は期限切れか処理済みです。お客さんに再申請を案内してください。");
    let customerId = input.customerId;
    if (input.mode === "new") {
      const name = receptionNameSchema.parse(input.newName);
      const customers = await tx.customer.findMany({ where: { storeId: context.storeId }, select: { id: true, customerCode: true, internalName: true, participantStaffId: true } });
      const sameName = customers.some(c => !c.participantStaffId && receptionNameKey(c.internalName) === receptionNameKey(name));
      if (sameName && !input.differentPersonConfirmed) throw new QrReceptionError("同じお名前の登録があります。既存会員か、別の方かを確認してください。");
      customerId = `qr-reception-${request.id}`;
      await tx.customer.create({ data: { id: customerId, storeId: context.storeId, customerCode: nextReceptionCode(customers.map(c => c.customerCode)), internalName: name } });
      await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_CREATE", entityType: "Customer", entityId: customerId, metadata: { source: "qr-reception", sameNameConfirmed: sameName } }, tx);
    }
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId: context.storeId, isActive: true, participantStaffId: null }, select: { id: true } });
    if (!customer) throw unavailable();
    const open = await tx.visit.findFirst({ where: { storeId: context.storeId, customerId, status: { in: ["WAITING", "PLAYING"] } }, select: { id: true } });
    const visitId = open?.id ?? await checkInVisitInTransaction(tx, customerId, context);
    await tx.qrReceptionRequest.update({ where: { id: request.id }, data: { status: "APPROVED", customerId, visitId, reviewedByStaffId: context.staffId, reviewedAt: now } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "QR_RECEPTION_APPROVE", entityType: "QrReceptionRequest", entityId: request.id, metadata: { customerId, visitId, createdCustomer: input.mode === "new", reusedOpenVisit: Boolean(open) } }, tx);
    return { replayed: false, visitId };
  }, { maxWait: 10000, timeout: 20000 });
}

export async function rejectReceptionRequest(database: Database, requestId: string, context: Context, now = new Date()) {
  if (!requestId || requestId.length > 200) throw unavailable();
  return database.$transaction(async tx => {
    await lockBusinessStore(tx, context.storeId); await actor(tx, context);
    const request = await tx.qrReceptionRequest.findFirst({ where: { id: requestId, storeId: context.storeId } });
    if (!request || request.status === "APPROVED") throw unavailable();
    if (request.status === "REJECTED") return;
    await tx.qrReceptionRequest.update({ where: { id: request.id }, data: { status: "REJECTED", reviewedByStaffId: context.staffId, reviewedAt: now } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "QR_RECEPTION_REJECT", entityType: "QrReceptionRequest", entityId: request.id }, tx);
  });
}
