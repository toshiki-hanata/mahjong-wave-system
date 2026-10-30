import "server-only";

import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import { BusinessDayBlockedError, BusinessDayNotFoundError, businessDayLabel, lockBusinessStore } from "./business-day-service";
import { businessDayTimeInputSchema, BusinessDayTimeValidationError, parseBusinessLocalDateTime, type BusinessDayTimeInput } from "./business-day-time";

export class BusinessDayTimeChangedError extends BusinessDayTimeValidationError {
  constructor() { super("別の操作で営業情報が変わっています。画面を更新し、最新の時刻を確認してください。"); }
}
export class BusinessDayTimePermissionError extends BusinessDayTimeValidationError {
  constructor() { super("時刻を訂正できるのはOWNER／MANAGERだけです。"); }
}

export async function updateBusinessDayTimes(
  database: Pick<PrismaClient, "$transaction">, raw: BusinessDayTimeInput,
  context: { storeId: string; staffId: string },
) {
  const parsed = businessDayTimeInputSchema.safeParse(raw);
  if (!parsed.success) throw new BusinessDayTimeValidationError(parsed.error.issues[0].message);
  const input = parsed.data;
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const staff = await tx.staff.findFirst({ where: { id: context.staffId, storeId: context.storeId, isActive: true }, select: { role: true } });
    if (!staff || (staff.role !== "OWNER" && staff.role !== "MANAGER")) throw new BusinessDayTimePermissionError();
    const day = await tx.businessDay.findFirst({ where: { id: input.businessDayId, storeId: context.storeId } });
    if (!day) throw new BusinessDayNotFoundError();
    const requestPayload = JSON.stringify(input);
    const replay = await tx.auditLog.findFirst({ where: {
      storeId: context.storeId, action: "BUSINESS_DAY_TIME_UPDATE", entityType: "BusinessDay", entityId: day.id,
      metadata: { path: ["requestKey"], equals: input.requestKey },
    }, select: { metadata: true } });
    if (replay) {
      const metadata = replay.metadata as { requestPayload?: string } | null;
      if (metadata?.requestPayload !== requestPayload) throw new BusinessDayTimeChangedError();
      return { replayed: true, unchanged: false };
    }
    if (day.openedAt.toISOString() !== input.expectedOpenedAt || (day.closedAt?.toISOString() ?? "") !== input.expectedClosedAt) throw new BusinessDayTimeChangedError();
    if (input.mode === "close" && day.closedAt) throw new BusinessDayTimeChangedError();
    if ((!day.closedAt && input.mode === "edit" && input.closedAtLocal) || ((day.closedAt || input.mode === "close") && !input.closedAtLocal)) {
      throw new BusinessDayTimeValidationError("終了済みの営業は再開できません。終了忘れは専用の終了操作を使ってください。");
    }
    const openedAt = parseBusinessLocalDateTime(input.openedAtLocal, day.timezone, day.openedAt);
    const closedAt = input.closedAtLocal ? parseBusinessLocalDateTime(input.closedAtLocal, day.timezone, day.closedAt) : null;
    const now = new Date();
    if (openedAt > now || (closedAt && closedAt > now)) throw new BusinessDayTimeValidationError("未来の日時は指定できません。");
    if (closedAt && closedAt <= openedAt) throw new BusinessDayTimeValidationError("終了日時は開始日時より後にしてください。");
    if (input.mode === "close") {
      const openVisits = await tx.visit.count({ where: { storeId: context.storeId, status: { in: ["WAITING", "PLAYING"] } } });
      const activeTables = await tx.tableSession.count({ where: { storeId: context.storeId, status: "ACTIVE" } });
      if (openVisits || activeTables) throw new BusinessDayBlockedError(openVisits, activeTables);
    }
    const where = { storeId: context.storeId, businessDayId: day.id };
    const visits = await tx.visit.aggregate({ where, _min: { checkedInAt: true }, _max: { checkedInAt: true, checkedOutAt: true } });
    const sessions = await tx.tableSession.aggregate({ where, _min: { startedAt: true }, _max: { startedAt: true, endedAt: true } });
    // A later score correction retains effectiveAt. Its registration time must not extend the business day.
    const games = await tx.game.aggregate({ where: { ...where, status: { in: ["CONFIRMED", "CORRECTED"] } }, _min: { effectiveAt: true }, _max: { effectiveAt: true } });
    const first = [visits._min.checkedInAt, sessions._min.startedAt, games._min.effectiveAt].filter((date): date is Date => date !== null);
    const last = [visits._max.checkedInAt, visits._max.checkedOutAt, sessions._max.startedAt, sessions._max.endedAt, games._max.effectiveAt].filter((date): date is Date => date !== null);
    if (first.some((date) => date < openedAt)) throw new BusinessDayTimeValidationError("開始日時を、この営業の来店・卓開始・対局の記録より後にはできません。");
    if (closedAt && last.some((date) => date > closedAt)) throw new BusinessDayTimeValidationError("終了日時を、この営業の退店・卓終了・対局などの記録より前にはできません。記録時刻を確認してください。");
    const overlap = await tx.businessDay.findFirst({ where: {
      storeId: context.storeId, id: { not: day.id },
      ...(closedAt ? { openedAt: { lt: closedAt } } : {}),
      OR: [{ closedAt: null }, { closedAt: { gt: openedAt } }],
    }, select: { id: true } });
    if (overlap) throw new BusinessDayTimeValidationError("別の営業と時間が重なります。前後の営業日時を確認してください。");
    if (openedAt.getTime() === day.openedAt.getTime() && closedAt?.getTime() === day.closedAt?.getTime()) return { replayed: false, unchanged: true };
    const label = businessDayLabel(openedAt, day.timezone);
    await tx.businessDay.update({ where: { id: day.id }, data: {
      openedAt, closedAt, label, ...(input.mode === "close" ? { closedByStaffId: context.staffId } : {}),
    } });
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId, action: "BUSINESS_DAY_TIME_UPDATE", entityType: "BusinessDay", entityId: day.id,
      metadata: {
        mode: input.mode, requestKey: input.requestKey, requestPayload, reason: input.reason, timezone: day.timezone,
        before: { openedAt: day.openedAt.toISOString(), closedAt: day.closedAt?.toISOString() ?? null, label: day.label },
        after: { openedAt: openedAt.toISOString(), closedAt: closedAt?.toISOString() ?? null, label },
      },
    }, tx);
    return { replayed: false, unchanged: false };
  });
}
