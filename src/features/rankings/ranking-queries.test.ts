import { describe, expect, it } from "vitest";
import { buildEffectiveResultWhere, getCustomerPerformance, getStoreRankingData } from "./ranking-queries";

const fixedNow = new Date("2026-10-12T03:00:00.000Z");

function mockDatabase(options: { active: boolean; results: Array<{ gameId: string; status: "CONFIRMED" | "CORRECTED" | "DRAFT"; customerId?: string; effectiveAt?: Date; rank?: number }> }) {
  const customer = {
    id: "customer-a", storeId: "store-a", internalName: "Test Customer", customerCode: "T-001", isActive: options.active,
  };
  const rows = options.results.map((result, index) => ({
    gameId: result.gameId,
    customerId: result.customerId ?? customer.id,
    rank: result.rank ?? (index === 0 ? 1 : 2),
    finalPoints: 30000,
    scoreScaled: 20,
    game: {
      id: result.gameId,
      status: result.status,
      effectiveAt: result.effectiveAt ?? fixedNow,
      ruleSnapshot: { scorePrecision: 1 },
      sequenceNumber: index + 1,
      tableSession: { mahjongTable: { name: "Test Table" } },
    },
  }));
  const db = {
    customer: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) =>
        where.id === customer.id && where.storeId === customer.storeId ? customer : null,
      findMany: async ({ where }: { where: { storeId: string; isActive: boolean } }) =>
        where.storeId === customer.storeId && where.isActive && customer.isActive
          ? [{ id: customer.id, internalName: customer.internalName, isActive: customer.isActive }]
          : [],
    },
    gamePlayerResult: {
      findMany: async ({ where }: { where: { storeId: string; customerId?: string; game: { is: { storeId: string; status: string } } } }) =>
        rows.filter((row) => where.storeId === customer.storeId
          && where.game.is.storeId === customer.storeId
          && where.game.is.status === "CONFIRMED"
          && (!where.customerId || row.customerId === where.customerId)
          && options.results.find((result) => result.gameId === row.gameId)?.status === "CONFIRMED"),
    },
    rankingSettings: { findUnique: async () => null },
  };
  return db as unknown as Parameters<typeof getCustomerPerformance>[0];
}

describe("effective ranking result scope", () => {
  it("requires the authenticated store and confirmed game status", () => {
    expect(buildEffectiveResultWhere("store-a")).toEqual({
      storeId: "store-a",
      game: { is: { storeId: "store-a", status: "CONFIRMED" } },
    });
  });

  it("excludes inactive customers and applies half-open effective-time bounds", () => {
    const start = new Date("2026-09-30T15:00:00.000Z");
    const end = new Date("2026-10-31T15:00:00.000Z");
    expect(buildEffectiveResultWhere("store-a", undefined, { start, end }, true)).toEqual({
      storeId: "store-a",
      customer: { is: { storeId: "store-a", isActive: true } },
      game: { is: { storeId: "store-a", status: "CONFIRMED", effectiveAt: { gte: start, lt: end } } },
    });
  });

  it("combines the customer ID with the store scope for personal statistics", () => {
    expect(buildEffectiveResultWhere("store-a", "customer-b")).toMatchObject({
      storeId: "store-a", customerId: "customer-b", game: { is: { storeId: "store-a", status: "CONFIRMED" } },
    });
  });

  it("returns performance for an active customer with confirmed games", async () => {
    const performance = await getCustomerPerformance(mockDatabase({ active: true, results: [{ gameId: "game-a", status: "CONFIRMED" }] }), "store-a", "customer-a", "Asia/Tokyo", fixedNow);
    expect(performance?.allTime).toMatchObject({ gamesPlayed: 1, firsts: 1, currentWinStreak: 1, maxWinStreak: 1 });
  });

  it("returns inactive customer history and includes only confirmed correction revisions", async () => {
    const performance = await getCustomerPerformance(mockDatabase({ active: false, results: [
      { gameId: "original", status: "CORRECTED" },
      { gameId: "replacement", status: "CONFIRMED", effectiveAt: new Date("2026-10-10T10:00:00Z"), rank: 1 },
      { gameId: "draft", status: "DRAFT" },
    ] }), "store-a", "customer-a", "Asia/Tokyo", fixedNow);
    expect(performance?.customer.isActive).toBe(false);
    expect(performance?.allTime).toMatchObject({ gamesPlayed: 1, firsts: 1, currentWinStreak: 1, maxWinStreak: 1 });
    expect(performance?.recentGames.map((game) => game.id)).toEqual(["replacement"]);
  });

  it("does not include inactive customers in regular rankings", async () => {
    const ranking = await getStoreRankingData(mockDatabase({ active: false, results: [{ gameId: "game-a", status: "CONFIRMED" }] }), "store-a", "Asia/Tokyo", "all", undefined, "scoreTotal");
    expect(ranking.rows).toEqual([]);
  });

  it("rejects a customer ID outside the scoped store", async () => {
    const performance = await getCustomerPerformance(mockDatabase({ active: true, results: [{ gameId: "game-a", status: "CONFIRMED" }] }), "another-store", "customer-a", "Asia/Tokyo", fixedNow);
    expect(performance).toBeNull();
  });

  it("returns safe zero performance for inactive customers without games", async () => {
    const performance = await getCustomerPerformance(mockDatabase({ active: false, results: [] }), "store-a", "customer-a", "Asia/Tokyo", fixedNow);
    expect(performance?.allTime).toMatchObject({ gamesPlayed: 0, firsts: 0, currentWinStreak: 0, maxWinStreak: 0, scoreTotal: "0" });
    expect(performance?.allTime.averageRank).toBeNull();
    expect(performance?.recentGames).toEqual([]);
  });
});
