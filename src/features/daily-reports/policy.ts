import { z } from "zod";
const id = z.string().min(1).max(200), name = z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export const payRuleSchema = z.object({ hourlyRateYen: z.number().int().min(1).max(100000), roundingMode: z.enum(["EXACT", "CEIL_15"]), nightRateBps: z.number().int().min(2500).max(30000), overtimeRateBps: z.number().int().min(2500).max(30000), holidayRateBps: z.number().int().min(3500).max(30000), overtimeAfterMinutes: z.number().int().min(60).max(480) });
export type PayRule = z.infer<typeof payRuleSchema>;
const request = { requestKey: z.uuid().transform(v => v.toLowerCase()) }, reason = z.string().trim().min(1).max(300);
export const workerInputSchema = payRuleSchema.extend({ ...request, id: id.optional(), expectedRevision: z.number().int().min(1).optional(), name, isActive: z.boolean(), reason });
const localDate = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
export const shiftInputSchema = z.object({ ...request, id: id.optional(), expectedRevision: z.number().int().min(1).optional(), businessDayId: id, workerId: id, startedAtLocal: localDate, endedAtLocal: z.union([localDate, z.literal("")]), breaks: z.array(z.object({ start: localDate, end: localDate })).max(10), statutoryHoliday: z.boolean(), refreshPayRule: z.boolean().default(false), reason });
export const CASH_KINDS = { SET_SALE: { label: "セット売上", direction: "IN", sales: true, worker: false }, DRINK_SALE: { label: "飲食売上", direction: "IN", sales: true, worker: false }, OTHER_SALE: { label: "その他売上", direction: "IN", sales: true, worker: false }, OTHER_IN: { label: "その他入金", direction: "IN", sales: false, worker: false }, STAFF_OUT: { label: "スタッフアウト出金", direction: "OUT", sales: false, worker: true }, STAFF_RETURN: { label: "スタッフアウト戻し入金", direction: "IN", sales: false, worker: true }, PAYROLL_PAID: { label: "給与の支払記録", direction: "OUT", sales: false, worker: true }, STORE_EXPENSE: { label: "店内経費", direction: "OUT", sales: false, worker: false }, EVENT_EXPENSE: { label: "イベント経費", direction: "OUT", sales: false, worker: false }, SERVICE_REFUND: { label: "サービス料・ゲーム代バック", direction: "OUT", sales: false, worker: false }, OTHER_OUT: { label: "その他出金", direction: "OUT", sales: false, worker: false } } as const;
export type CashKind = keyof typeof CASH_KINDS;
export const cashInputSchema = z.object({ ...request, businessDayId: id, kind: z.enum(Object.keys(CASH_KINDS) as [CashKind, ...CashKind[]]), workerId: id.optional(), amountYen: z.number().int().min(1).max(100000000), description: reason, occurredAtLocal: localDate }).refine(v => CASH_KINDS[v.kind].worker === Boolean(v.workerId));
export const voidCashSchema = z.object({ ...request, businessDayId: id, entryId: id, reason });
export const voidShiftSchema = voidCashSchema.extend({ expectedRevision: z.number().int().min(1) });
export class ReportError extends Error { constructor(message = "日報を処理できません。最新の記録と入力内容を確認してください。") { super(message); } }
export class ReportPermissionError extends ReportError {}
export function reportId(value: unknown): string { return id.parse(value); }
