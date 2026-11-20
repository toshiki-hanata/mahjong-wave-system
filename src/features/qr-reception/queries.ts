import "server-only";
import type { PrismaClient } from "@prisma/client";
import { validStationKey, validReceptionToken, receiptHash, QR_RECEPTION_POLICY } from "./policy";

export async function publicReceptionView(database: PrismaClient, storeId: string, key: string, secret: string, receiptToken?: string, now = new Date()) {
  const setting = await database.qrReceptionSetting.findUnique({ where: { storeId }, include: { store: { select: { name: true, isActive: true } } } });
  if (!setting?.enabled || !setting.store.isActive || !validStationKey(storeId, setting.revision, key, secret)) return null;
  const day = await database.businessDay.findFirst({ where: { storeId, closedAt: null }, select: { id: true } });
  const request = receiptToken && validReceptionToken(storeId, key, receiptToken, secret, QR_RECEPTION_POLICY.receiptSeconds * 1000, now)
    ? await database.qrReceptionRequest.findFirst({ where: { tokenHash: receiptHash(receiptToken), storeId }, select: { receiptCode: true, status: true, businessDayId: true, expiresAt: true, stationRevision: true, visit: { select: { status: true } } } }) : null;
  const state: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null = !request ? null : request.status === "PENDING" && (!day || request.businessDayId !== day.id || request.expiresAt <= now || request.stationRevision !== setting.revision) ? "EXPIRED" : request.status;
  return {
    storeName: setting.store.name, open: Boolean(day),
    receipt: request ? { code: request.receiptCode, state } : null,
    canSubmit: Boolean(day) && (!request || state === "EXPIRED" || state === "REJECTED" || (state === "APPROVED" && (request.visit?.status === "CHECKED_OUT" || request.businessDayId !== day?.id))),
  };
}

export async function staffReceptionQueue(database: PrismaClient, storeId: string, now = new Date()) {
  const [setting, day] = await Promise.all([
    database.qrReceptionSetting.findUnique({ where: { storeId } }),
    database.businessDay.findFirst({ where: { storeId, closedAt: null }, select: { id: true } }),
  ]);
  const requests = day && setting?.enabled ? await database.qrReceptionRequest.findMany({
    where: { storeId, businessDayId: day.id, stationRevision: setting.revision, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" }, take: 100,
    select: { id: true, submittedName: true, receiptCode: true, createdAt: true },
  }) : [];
  return { setting, open: Boolean(day), requests };
}

/** Count only the authenticated store's current, valid pending requests. Never return applicant names. */
export async function pendingReceptionCount(database: PrismaClient, storeId: string, now = new Date()): Promise<number> {
  const setting = await database.qrReceptionSetting.findUnique({ where: { storeId }, select: { enabled: true, revision: true } });
  if (!setting?.enabled) return 0;
  return database.qrReceptionRequest.count({ where: { storeId, stationRevision: setting.revision, status: "PENDING", expiresAt: { gt: now }, businessDay: { is: { storeId, closedAt: null } } } });
}
