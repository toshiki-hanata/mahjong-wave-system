export type GameRule = {
  startingPoints: number;
  returnPoints: number;
  umaFirst: number;
  umaSecond: number;
  umaThird: number;
  umaFourth: number;
  okaTop: number;
  pointUnit: number;
  requiredTotal: number;
  allowNegative: boolean;
  tieBreakRule: "POSITION_ASC";
  scorePointDivisor: number;
  scorePrecision: number;
  roundingMode: "NONE" | "HALF_UP" | "DOWN";
};

export type ScoredPlayer = { visitId: string; customerId: string; position: number; finalPoints: number };
export type CalculatedPlayer = ScoredPlayer & { rank: number; scoreScaled: number };

export class InvalidFinalPointsError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidFinalPointsError"; }
}

export function validateFinalPoints(players: readonly ScoredPlayer[], rule: GameRule): void {
  if (players.length !== 4 || new Set(players.map((player) => player.visitId)).size !== 4
    || new Set(players.map((player) => player.customerId)).size !== 4
    || new Set(players.map((player) => player.position)).size !== 4
    || ![1, 2, 3, 4].every((position) => players.some((player) => player.position === position))) {
    throw new InvalidFinalPointsError("位置1〜4の異なる4名を指定してください。");
  }
  for (const player of players) {
    if (!Number.isSafeInteger(player.finalPoints)) throw new InvalidFinalPointsError("持ち点は整数で入力してください。");
    if (!rule.allowNegative && player.finalPoints < 0) throw new InvalidFinalPointsError("マイナス点は入力できません。");
    if (player.finalPoints % rule.pointUnit !== 0) throw new InvalidFinalPointsError(`${rule.pointUnit}点単位で入力してください。`);
  }
  if (players.reduce((total, player) => total + player.finalPoints, 0) !== rule.requiredTotal) {
    throw new InvalidFinalPointsError(`4人の合計点は${rule.requiredTotal.toLocaleString("ja-JP")}点にしてください。`);
  }
}

export function calculateRanks(players: readonly ScoredPlayer[], rule: Pick<GameRule, "tieBreakRule">): Array<ScoredPlayer & { rank: number }> {
  return [...players]
    .sort((a, b) => b.finalPoints - a.finalPoints || (rule.tieBreakRule === "POSITION_ASC" ? a.position - b.position : 0))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

function roundFraction(numerator: number, denominator: number, mode: GameRule["roundingMode"]): number {
  const quotient = numerator / denominator;
  if (Number.isInteger(quotient)) return quotient;
  if (mode === "NONE") throw new InvalidFinalPointsError("このルールでは端数が発生する点数を保存できません。");
  if (mode === "DOWN") return Math.trunc(quotient);
  return Math.sign(quotient) * Math.floor(Math.abs(quotient) + 0.5);
}

export function calculateScores(
  ranked: readonly (ScoredPlayer & { rank: number })[],
  rule: Pick<GameRule, "returnPoints" | "umaFirst" | "umaSecond" | "umaThird" | "umaFourth" | "okaTop" | "scorePointDivisor" | "scorePrecision" | "roundingMode">,
): CalculatedPlayer[] {
  const uma = [rule.umaFirst, rule.umaSecond, rule.umaThird, rule.umaFourth];
  const scale = 10 ** rule.scorePrecision;
  return ranked.map((player) => {
    const base = roundFraction((player.finalPoints - rule.returnPoints) * scale, rule.scorePointDivisor, rule.roundingMode);
    const bonus = (uma[player.rank - 1] + (player.rank === 1 ? rule.okaTop : 0)) * scale;
    return { ...player, scoreScaled: base + bonus };
  });
}

export function calculateGame(players: readonly ScoredPlayer[], rule: GameRule): CalculatedPlayer[] {
  validateFinalPoints(players, rule);
  return calculateScores(calculateRanks(players, rule), rule);
}

export function scoreForDisplay(scoreScaled: number, precision = 1): string {
  return (scoreScaled / 10 ** precision).toFixed(precision);
}
