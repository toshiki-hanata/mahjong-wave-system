import { payRuleSchema, type PayRule, ReportError } from "./policy";
export type WorkBreak = { start: string; end: string };
export function validateWorkPeriod(start: Date, end: Date | null, breaks: WorkBreak[]) {
  if (!Number.isFinite(start.getTime()) || start.getTime() % 60000 || (end && (!Number.isFinite(end.getTime()) || end <= start || end.getTime() % 60000 || end.getTime() - start.getTime() > 48 * 3600000))) throw new ReportError("出退勤は1分単位で、退勤は出勤後48時間以内に入力してください。");
  const sorted = [...breaks].map(b => ({ start: new Date(b.start), end: new Date(b.end) })).sort((a,b) => a.start.getTime() - b.start.getTime());
  if (sorted.length > 10 || sorted.some((b,i) => !Number.isFinite(b.start.getTime()) || !Number.isFinite(b.end.getTime()) || b.start < start || !end || b.end > end || b.end <= b.start || b.start.getTime() % 60000 || b.end.getTime() % 60000 || (i > 0 && b.start < sorted[i-1].end))) throw new ReportError("休憩は勤務時間内で、重複しない開始・終了日時を入力してください。");
  return sorted;
}
export function calculateReportWage(start: Date, end: Date, breaks: WorkBreak[], rawRule: unknown, timezone: string, holiday: boolean, previousWorkedMinutes = 0) {
  const rule: PayRule = payRuleSchema.parse(rawRule), rest = validateWorkPeriod(start, end, breaks);
  if (!Number.isSafeInteger(previousWorkedMinutes) || previousWorkedMinutes < 0) throw new ReportError();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" });
  let workedMinutes = 0, nightMinutes = 0;
  for (let t=start.getTime(); t<end.getTime(); t+=60000) {
    if (rest.some(b => t >= b.start.getTime() && t < b.end.getTime())) continue;
    workedMinutes++; const hour = Number(formatter.format(new Date(t))); if (hour >= 22 || hour < 5) nightMinutes++;
  }
  const paidMinutes = rule.roundingMode === "CEIL_15" ? Math.ceil(workedMinutes / 15) * 15 : workedMinutes;
  const overtimeMinutes = holiday ? 0 : Math.max(0, previousWorkedMinutes + workedMinutes - rule.overtimeAfterMinutes) - Math.max(0, previousWorkedMinutes - rule.overtimeAfterMinutes);
  const numerator = BigInt(rule.hourlyRateYen) * (BigInt(paidMinutes)*BigInt(10000) + BigInt(nightMinutes)*BigInt(rule.nightRateBps) + BigInt(overtimeMinutes)*BigInt(rule.overtimeRateBps) + BigInt(holiday ? workedMinutes : 0)*BigInt(rule.holidayRateBps));
  const grossYen = Number((numerator + BigInt(599999)) / BigInt(600000));
  if (!Number.isSafeInteger(grossYen)) throw new ReportError();
  return { workedMinutes, paidMinutes, nightMinutes, overtimeMinutes, holidayMinutes: holiday ? workedMinutes : 0, grossYen };
}
