import { describe, expect, it } from "vitest";
import { businessLocalDateTime, parseBusinessLocalDateTime, businessDayTimeInputSchema, readBusinessDayTimeAudit } from "./business-day-time";

describe("Business day local times", () => {
  it("uses the saved timezone instead of the browser or server timezone", () => {
    const date = new Date("2026-01-01T15:01:02.123Z");
    expect(businessLocalDateTime(date, "Asia/Tokyo")).toBe("2026-01-02T00:01:02");
    expect(parseBusinessLocalDateTime("2026-01-02T00:01:02", "Asia/Tokyo").toISOString()).toBe("2026-01-01T15:01:02.000Z");
    expect(parseBusinessLocalDateTime("2026-01-01T07:01", "America/Los_Angeles").toISOString()).toBe("2026-01-01T15:01:00.000Z");
  });
  it("preserves hidden milliseconds when displayed seconds are unchanged", () => {
    const date = new Date("2026-01-01T15:01:02.123Z");
    expect(parseBusinessLocalDateTime("2026-01-02T00:01:02", "Asia/Tokyo", date)).toBe(date);
  });
  it.each(["2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T24:00", "not-a-date"])("rejects invalid local time %s", (value) => {
    expect(() => parseBusinessLocalDateTime(value, "Asia/Tokyo")).toThrow();
  });
  it("rejects ambiguous and skipped DST times", () => {
    expect(() => parseBusinessLocalDateTime("2026-03-08T02:30", "America/Los_Angeles")).toThrow();
    expect(() => parseBusinessLocalDateTime("2026-11-01T01:30", "America/Los_Angeles")).toThrow();
  });
  it("requires a reason and a complete saved-time snapshot", () => {
    const input = { businessDayId: "day", requestKey: "428a3d8d-0e15-40de-9899-0056d66743f4", mode: "edit", expectedOpenedAt: "2026-01-01T00:00:00.123Z", expectedClosedAt: "", openedAtLocal: "2026-01-01T09:00", closedAtLocal: "", reason: " 訂正 " };
    expect(businessDayTimeInputSchema.parse(input).reason).toBe("訂正");
    expect(businessDayTimeInputSchema.safeParse({ ...input, reason: "  " }).success).toBe(false);
    expect(businessDayTimeInputSchema.safeParse({ ...input, expectedOpenedAt: undefined }).success).toBe(false);
    expect(businessDayTimeInputSchema.safeParse({ ...input, requestKey: "old" }).success).toBe(false);
    expect(readBusinessDayTimeAudit({ reason: "incomplete" })).toBeNull();
  });
});
