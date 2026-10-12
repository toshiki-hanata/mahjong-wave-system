import { describe, expect, it } from "vitest";
import { currentPeriodValue, getPreviousPeriodValue, getRankingPeriodBounds } from "./ranking-period";

describe("ranking periods use store calendar boundaries", () => {
  it("uses Tokyo local month starts while storing UTC boundaries", () => {
    const bounds = getRankingPeriodBounds("month", "2026-10", "Asia/Tokyo");
    expect(bounds?.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-10-31T15:00:00.000Z");
  });

  it("uses calendar year boundaries and handles leap years", () => {
    const bounds = getRankingPeriodBounds("year", "2024", "Asia/Tokyo");
    expect(bounds?.start.toISOString()).toBe("2023-12-31T15:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2024-12-31T15:00:00.000Z");
  });

  it("uses each local month boundary's timezone offset when daylight saving changes", () => {
    const bounds = getRankingPeriodBounds("month", "2026-03", "America/New_York");
    expect(bounds?.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });

  it("resolves the current local month and previous month across year boundaries", () => {
    expect(currentPeriodValue("month", "Asia/Tokyo", new Date("2026-01-01T00:30:00.000Z"))).toBe("2026-01");
    expect(getPreviousPeriodValue("month", "2026-01")).toBe("2025-12");
  });

  it("rejects invalid month and year tokens", () => {
    expect(() => getRankingPeriodBounds("month", "2026-13", "Asia/Tokyo")).toThrow();
    expect(() => getRankingPeriodBounds("year", "26", "Asia/Tokyo")).toThrow();
  });
});
