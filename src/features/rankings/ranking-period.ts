export type RankingPeriodKind = "month" | "year" | "all";
export type PeriodBounds = { start: Date; end: Date; label: string } | null;

function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function toLocalDateStartUtc(year: number, month: number, day: number, timeZone: string): Date {
  const targetPseudoUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let candidate = targetPseudoUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const difference = targetPseudoUtc - displayedAsUtc;
    if (difference === 0) return new Date(candidate);
    candidate += difference;
  }
  const finalParts = localDateParts(new Date(candidate), timeZone);
  if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day) {
    throw new Error("Could not resolve a calendar boundary for the store timezone.");
  }
  return new Date(candidate);
}

export function currentPeriodValue(kind: Exclude<RankingPeriodKind, "all">, timeZone: string, now = new Date()): string {
  const { year, month } = localDateParts(now, timeZone);
  return kind === "month" ? `${year}-${String(month).padStart(2, "0")}` : String(year);
}

export function getRankingPeriodBounds(kind: RankingPeriodKind, value: string | undefined, timeZone: string, now = new Date()): PeriodBounds {
  if (kind === "all") return null;
  const selected = value || currentPeriodValue(kind, timeZone, now);
  if (kind === "month") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(selected);
    if (!match) throw new Error("Invalid monthly ranking period.");
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1900 || year > 9998) throw new Error("Invalid monthly ranking year.");
    return {
      start: toLocalDateStartUtc(year, month, 1, timeZone),
      end: month === 12 ? toLocalDateStartUtc(year + 1, 1, 1, timeZone) : toLocalDateStartUtc(year, month + 1, 1, timeZone),
      label: `${year}年${month}月`,
    };
  }
  const match = /^(\d{4})$/.exec(selected);
  if (!match) throw new Error("Invalid yearly ranking period.");
  const year = Number(match[1]);
  if (year < 1900 || year > 9998) throw new Error("Invalid yearly ranking year.");
  return {
    start: toLocalDateStartUtc(year, 1, 1, timeZone),
    end: toLocalDateStartUtc(year + 1, 1, 1, timeZone),
    label: `${year}年`,
  };
}

export function getPreviousPeriodValue(kind: Exclude<RankingPeriodKind, "all">, value: string): string {
  if (kind === "year") {
    const year = Number(value);
    if (!Number.isInteger(year)) throw new Error("Invalid yearly ranking period.");
    return String(year - 1);
  }
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new Error("Invalid monthly ranking period.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
