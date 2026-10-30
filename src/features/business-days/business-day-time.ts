import { z } from "zod";

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, "日時を入力してください。");
const savedTime = z.iso.datetime();
export const businessDayTimeInputSchema = z.object({
  businessDayId: z.string().min(1).max(200),
  requestKey: z.uuid(),
  mode: z.enum(["edit", "close"]),
  expectedOpenedAt: savedTime,
  expectedClosedAt: z.union([savedTime, z.literal("")]),
  openedAtLocal: localTime,
  closedAtLocal: z.union([localTime, z.literal("")]),
  reason: z.string().trim().min(1, "訂正・終了忘れの理由を入力してください。").max(500, "理由は500文字以内で入力してください。"),
});
export type BusinessDayTimeInput = z.infer<typeof businessDayTimeInputSchema>;
export class BusinessDayTimeValidationError extends Error {}

/** datetime-local has no offset. Always interpret it in the saved store timezone. */
export function businessLocalDateTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function parseBusinessLocalDateTime(value: string, timezone: string, original?: Date | null): Date {
  if (!localTime.safeParse(value).success) throw new BusinessDayTimeValidationError("正しい日時を入力してください。");
  const normalized = value.length === 16 ? `${value}:00` : value;
  // Keep original milliseconds when the displayed value has not been edited.
  if (original && businessLocalDateTime(original, timezone) === normalized) return original;
  const naive = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== normalized) {
    throw new BusinessDayTimeValidationError("存在しない日付・時刻です。");
  }
  // Consider offsets on both sides of DST changes; reject skipped/ambiguous local times.
  const offsets = new Set([-36, 0, 36].map((hours) => {
    const sample = naive + hours * 3_600_000;
    return Date.parse(`${businessLocalDateTime(new Date(sample), timezone)}Z`) - sample;
  }));
  const candidates = [...offsets].map((offset) => new Date(naive - offset))
    .filter((date) => businessLocalDateTime(date, timezone) === normalized);
  if (candidates.length !== 1) throw new BusinessDayTimeValidationError("店舗のタイムゾーンで一意に決まらない時刻です。別の時刻を指定してください。");
  return candidates[0];
}

const auditTimes = z.object({ openedAt: savedTime, closedAt: z.union([savedTime, z.null()]), label: z.string() });
const timeAudit = z.object({ reason: z.string(), timezone: z.string(), before: auditTimes, after: auditTimes });
export function readBusinessDayTimeAudit(metadata: unknown) {
  const result = timeAudit.safeParse(metadata);
  return result.success ? result.data : null;
}
