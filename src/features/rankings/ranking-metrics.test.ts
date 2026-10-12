import { describe, expect, it } from "vitest";
import { buildRankingRows, calculateCustomerPerformance, type PerformanceCustomer, type PerformanceResult } from "./ranking-metrics";

const customers: PerformanceCustomer[] = [
  { id: "a", internalName: "花子", isActive: true },
  { id: "b", internalName: "太郎", isActive: true },
  { id: "c", internalName: "次郎", isActive: true },
  { id: "d", internalName: "三郎", isActive: true },
  { id: "inactive", internalName: "無効顧客", isActive: false },
];

function result(gameId: string, customerId: string, rank: number, scoreScaled: number, scorePrecision = 1, effectiveAt = "2026-10-01T00:00:00.000Z"): PerformanceResult {
  return { gameId, customerId, rank, finalPoints: 25_000, scoreScaled, scorePrecision, effectiveAt: new Date(effectiveAt) };
}

describe("ranking metrics", () => {
  it("normalizes score precisions as exact integers and gives equal values shared competition ranks", () => {
    const rows = buildRankingRows(customers, [
      result("g1", "a", 1, 10, 1),
      result("g2", "a", 2, 100, 2),
      result("g3", "b", 1, 200, 2),
      result("g4", "c", 1, 100, 2),
    ], 1, "scoreTotal");
    expect(rows.filter((row) => row.eligible).map((row) => [row.customerId, row.placement, row.stats.scoreTotal])).toEqual([
      ["a", 1, "2"], ["b", 1, "2"], ["c", 3, "1"],
    ]);
  });

  it("uses exact unrounded fractions for rate and average-rank ties", () => {
    const entries = [
      result("a1", "a", 1, 10), result("a2", "a", 4, 10),
      result("b1", "b", 2, 10), result("b2", "b", 3, 10),
    ];
    const averageRows = buildRankingRows(customers, entries, 1, "averageRank");
    expect(averageRows.filter((row) => row.eligible).map((row) => row.placement)).toEqual([1, 1]);
    const rateRows = buildRankingRows(customers, [
      result("a1", "a", 1, 0), result("a2", "a", 2, 0), result("a3", "a", 4, 0),
      result("b1", "b", 1, 0), result("b2", "b", 3, 0), result("b3", "b", 4, 0),
    ], 1, "topRate");
    expect(rateRows.filter((row) => row.eligible).map((row) => row.placement)).toEqual([1, 1]);
  });

  it("excludes inactive customers and leaves below-threshold results unranked", () => {
    const rows = buildRankingRows(customers, [result("g1", "a", 1, 15)], 2);
    expect(new Set(rows.map((row) => row.customerId))).toEqual(new Set(["a", "b", "c", "d"]));
    expect(rows.find((row) => row.customerId === "a")).toMatchObject({ gamesPlayed: 1, placement: null, eligible: false });
  });

  it("uses standard competition ranks with gaps after ties", () => {
    const rows = buildRankingRows(customers, [
      result("a1", "a", 1, 30),
      result("b1", "b", 1, 10), result("b2", "b", 2, 10),
      result("c1", "c", 2, 20),
      result("d1", "d", 3, 0),
    ], 1, "scoreTotal");
    expect(rows.map((row) => row.placement)).toEqual([1, 2, 2, 4]);
  });

  it("calculates lifetime streak across calendar dates and sessions from effective time order", () => {
    const stats = calculateCustomerPerformance([
      result("g3", "a", 1, 1, 1, "2026-10-03T00:00:00.000Z"),
      result("g1", "a", 1, 1, 1, "2026-10-01T00:00:00.000Z"),
      result("g2", "a", 1, 1, 1, "2026-10-02T00:00:00.000Z"),
      result("g4", "a", 3, 1, 1, "2026-10-04T00:00:00.000Z"),
    ], customers[0]!);
    expect(stats).toMatchObject({ gamesPlayed: 4, currentWinStreak: 0, maxWinStreak: 3, firsts: 3, thirds: 1 });
  });

  it("rejects malformed rule snapshot precision", () => {
    expect(() => buildRankingRows(customers, [{ ...result("g1", "a", 1, 1), scorePrecision: 4 }], 1)).toThrow(/scorePrecision/);
  });
});
