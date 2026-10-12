import { describe, expect, it } from "vitest";
import { calculateGame, InvalidFinalPointsError, scoreForDisplay, type GameRule, type ScoredPlayer } from "./game-calculation";
import { gameCorrectionRoles, gameEntryRoles, storeRuleRoles } from "./game-permissions";
import { gameCorrectionSchema, gameInputSchema, storeRuleSchema } from "./game-schemas";
import { Role } from "@prisma/client";

const rule: GameRule = {
  startingPoints: 25_000, returnPoints: 30_000,
  umaFirst: 20, umaSecond: 10, umaThird: -10, umaFourth: -20, okaTop: 20,
  pointUnit: 100, requiredTotal: 100_000, allowNegative: true,
  tieBreakRule: "POSITION_ASC", scorePointDivisor: 1000, scorePrecision: 1, roundingMode: "NONE",
};
const players: ScoredPlayer[] = [
  { visitId: "v1", customerId: "c1", position: 1, finalPoints: 40_000 },
  { visitId: "v2", customerId: "c2", position: 2, finalPoints: 30_000 },
  { visitId: "v3", customerId: "c3", position: 3, finalPoints: 20_000 },
  { visitId: "v4", customerId: "c4", position: 4, finalPoints: 10_000 },
];

describe("provisional StoreRule game calculations", () => {
  it("calculates places and scores from the supplied rule without fixed rule values", () => {
    const result = calculateGame(players, rule);
    expect(result.map((player) => [player.position, player.rank, player.scoreScaled])).toEqual([[1, 1, 500], [2, 2, 100], [3, 3, -200], [4, 4, -400]]);
    expect(scoreForDisplay(result[0]!.scoreScaled, rule.scorePrecision)).toBe("50.0");
  });

  it("allows negative points and breaks equal points by smaller physical position", () => {
    const tied = [
      { ...players[0]!, position: 2, finalPoints: 35_000 },
      { ...players[1]!, position: 1, finalPoints: 35_000 },
      { ...players[2]!, position: 3, finalPoints: 11_000 },
      { ...players[3]!, position: 4, finalPoints: 19_000 },
    ];
    const result = calculateGame(tied, rule);
    expect(result.slice(0, 2).map(({ position, rank }) => [position, rank])).toEqual([[1, 1], [2, 2]]);
    expect(calculateGame([{ ...players[0]!, finalPoints: -1_000 }, { ...players[1]!, finalPoints: 40_000 }, { ...players[2]!, finalPoints: 30_000 }, { ...players[3]!, finalPoints: 31_000 }], rule).some((player) => player.finalPoints < 0)).toBe(true);
  });

  it("rejects points outside unit, total, integer, and distinct-seat constraints", () => {
    expect(() => calculateGame(players.map((player, i) => i ? player : { ...player, finalPoints: 40_050 }), rule)).toThrow(InvalidFinalPointsError);
    expect(() => calculateGame(players.map((player, i) => i ? player : { ...player, finalPoints: 39_900 }), rule)).toThrow(/合計点/);
    expect(() => calculateGame(players.map((player, i) => i ? player : { ...player, finalPoints: 40_000.5 }), rule)).toThrow(/整数/);
    expect(() => calculateGame(players.map((player, i) => i ? player : { ...player, position: 2 }), rule)).toThrow(/位置/);
  });

  it("rejects fractional results when rounding is configured as NONE", () => {
    const fractional = { ...rule, pointUnit: 1, requiredTotal: 100_000, scorePrecision: 0 };
    const sample = [{ ...players[0]!, finalPoints: 40_001 }, { ...players[1]!, finalPoints: 30_000 }, { ...players[2]!, finalPoints: 20_000 }, { ...players[3]!, finalPoints: 9_999 }];
    expect(() => calculateGame(sample, fractional)).toThrow(/端数/);
  });

  it("uses the score divisor from the versioned rule", () => {
    const customDivisor = { ...rule, scorePointDivisor: 500 };
    expect(calculateGame(players, customDivisor)[0]?.scoreScaled).toBe(600);
  });

  it("validates StoreRule, idempotent game inputs, and correction reason", () => {
    expect(storeRuleSchema.safeParse({ ...rule, isProvisional: true }).success).toBe(true);
    expect(gameInputSchema.safeParse({ tableSessionId: "session", idempotencyKey: "00000000-0000-4000-8000-000000000001", points: players.map(({ position, finalPoints }) => ({ position, finalPoints })) }).success).toBe(true);
    expect(gameCorrectionSchema.safeParse({ gameId: "game", idempotencyKey: "00000000-0000-4000-8000-000000000002", reason: "入力誤り", points: players.map(({ position, finalPoints }) => ({ position, finalPoints })) }).success).toBe(true);
    expect(gameCorrectionSchema.safeParse({ gameId: "game", idempotencyKey: "00000000-0000-4000-8000-000000000002", reason: " ", points: players.map(({ position, finalPoints }) => ({ position, finalPoints })) }).success).toBe(false);
  });

  it("limits rule changes and corrections while allowing all staff to record games", () => {
    expect(gameEntryRoles).toContain(Role.STAFF);
    expect(gameCorrectionRoles).toEqual([Role.OWNER, Role.MANAGER]);
    expect(storeRuleRoles).toEqual([Role.OWNER, Role.MANAGER]);
    expect(gameCorrectionRoles).not.toContain(Role.STAFF);
  });
});
