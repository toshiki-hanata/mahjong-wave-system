import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";

export class BusinessDayClosedError extends Error {
  constructor() { super("営業開始後に来店受付・卓開始・結果入力を行ってください。"); }
}
export class BusinessDayBlockedError extends Error {
  constructor(public readonly openVisits: number, public readonly activeTables: number) {
    super(`未退店 ${openVisits}人・利用中 ${activeTables}卓があります。卓の解放・退店を済ませてください。`);
  }
}
export class BusinessDayNotFoundError extends Error {}

export function businessDayLabel(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** All attendance/session/game mutations take this store lock first, before row locks. */
export async function lockBusinessStore(tx: Prisma.TransactionClient, storeId: string) {
  const stores = await tx.$queryRaw<Array<{ id: string; timezone: string; freeGamePriceYen: number }>>`
    SELECT "id", "timezone", "freeGamePriceYen" FROM "Store"
    WHERE "id" = ${storeId} AND "isActive" = true FOR UPDATE
  `;
  if (!stores[0]) throw new BusinessDayNotFoundError();
  return stores[0];
}

export async function requireOpenBusinessDay(tx: Prisma.TransactionClient, storeId: string) {
  await lockBusinessStore(tx, storeId);
  const day = await tx.businessDay.findFirst({ where: { storeId, closedAt: null } });
  if (!day) throw new BusinessDayClosedError();
  return day;
}

async function countOpenActivity(tx: Prisma.TransactionClient, storeId: string) {
  const openVisits = await tx.visit.count({ where: { storeId, status: { in: ["WAITING", "PLAYING"] } } });
  const activeTables = await tx.tableSession.count({ where: { storeId, status: "ACTIVE" } });
  return { openVisits, activeTables };
}

type Context = { storeId: string; staffId: string };
type Database = Pick<PrismaClient, "$transaction">;

export async function openBusinessDay(database: Database, requestKey: string, context: Context) {
  return database.$transaction(async (tx) => {
    const store = await lockBusinessStore(tx, context.storeId);
    const replay = await tx.businessDay.findFirst({ where: { storeId: context.storeId, requestKey } });
    if (replay) return { day: replay, replayed: true };
    const current = await tx.businessDay.findFirst({ where: { storeId: context.storeId, closedAt: null } });
    if (current) return { day: current, replayed: true };
    const blockers = await countOpenActivity(tx, context.storeId);
    if (blockers.openVisits || blockers.activeTables) throw new BusinessDayBlockedError(blockers.openVisits, blockers.activeTables);
    const openedAt = new Date();
    const day = await tx.businessDay.create({ data: {
      storeId: context.storeId, requestKey, label: businessDayLabel(openedAt, store.timezone), timezone: store.timezone,
      freeGamePriceYen: store.freeGamePriceYen, openedAt, openedByStaffId: context.staffId,
    } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "BUSINESS_DAY_OPEN", entityType: "BusinessDay", entityId: day.id, metadata: { label: day.label, freeGamePriceYen: day.freeGamePriceYen } }, tx);
    return { day, replayed: false };
  });
}

export async function closeBusinessDay(database: Database, businessDayId: string, context: Context) {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const day = await tx.businessDay.findFirst({ where: { id: businessDayId, storeId: context.storeId } });
    if (!day) throw new BusinessDayNotFoundError();
    if (day.closedAt) return { replayed: true };
    const blockers = await countOpenActivity(tx, context.storeId);
    if (blockers.openVisits || blockers.activeTables) throw new BusinessDayBlockedError(blockers.openVisits, blockers.activeTables);
    await tx.businessDay.update({ where: { id: day.id }, data: { closedAt: new Date(), closedByStaffId: context.staffId } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "BUSINESS_DAY_CLOSE", entityType: "BusinessDay", entityId: day.id }, tx);
    return { replayed: false };
  });
}

export async function updateFreeGamePrice(database: Database, freeGamePriceYen: number, context: Context) {
  if (!Number.isInteger(freeGamePriceYen) || freeGamePriceYen < 0 || freeGamePriceYen > 1_000_000) throw new RangeError("Invalid price");
  return database.$transaction(async (tx) => {
    const store = await lockBusinessStore(tx, context.storeId);
    await tx.store.update({ where: { id: context.storeId }, data: { freeGamePriceYen } });
    await recordAuditLog({ storeId: context.storeId, actorStaffId: context.staffId, action: "FREE_GAME_PRICE_UPDATE", entityType: "Store", entityId: context.storeId, metadata: { before: store.freeGamePriceYen, after: freeGamePriceYen, appliesTo: "next-business-day" } }, tx);
  });
}
