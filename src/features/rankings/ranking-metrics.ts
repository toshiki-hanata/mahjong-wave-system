export type RankingMetricKey =
  | "scoreTotal"
  | "averageRank"
  | "topRate"
  | "reachRate"
  | "bustAvoidanceRate"
  | "gamesPlayed"
  | "maxWinStreak";

export type PerformanceResult = {
  gameId: string;
  customerId: string;
  effectiveAt: Date;
  rank: number;
  finalPoints: number;
  scoreScaled: number;
  scorePrecision: number;
};

export type PerformanceCustomer = { id: string; internalName: string; isActive: boolean };

type ExactStats = {
  customer: PerformanceCustomer;
  gamesPlayed: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
  rankTotal: number;
  scoreUnits: bigint;
  currentWinStreak: number;
  maxWinStreak: number;
};

export type PerformanceStats = {
  gamesPlayed: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
  averageRank: string | null;
  topRate: string | null;
  reachRate: string | null;
  bustAvoidanceRate: string | null;
  scoreTotal: string;
  scoreAverage: string | null;
  maxWinStreak: number;
  currentWinStreak: number;
};

export type RankingRow = {
  customerId: string;
  internalName: string;
  gamesPlayed: number;
  placement: number | null;
  eligible: boolean;
  stats: PerformanceStats;
};

const SCORE_PRECISION_LIMIT = 3;

export function scorePrecisionFromSnapshot(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Game ruleSnapshot is invalid.");
  const precision = (snapshot as Record<string, unknown>).scorePrecision;
  if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 0 || precision > SCORE_PRECISION_LIMIT) {
    throw new Error("Game ruleSnapshot scorePrecision is invalid.");
  }
  return precision;
}

function pow10(precision: number): bigint { return BigInt(10) ** BigInt(precision); }

function compareChronologically(left: PerformanceResult, right: PerformanceResult): number {
  const time = left.effectiveAt.getTime() - right.effectiveAt.getTime();
  return time || left.gameId.localeCompare(right.gameId);
}

function roundRatioHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= BigInt(0)) throw new Error("denominator must be positive");
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * BigInt(2) + denominator) / (denominator * BigInt(2));
  return negative ? -rounded : rounded;
}

function formatScaled(value: bigint, precision: number, trim = true): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const scale = pow10(precision);
  const whole = absolute / scale;
  if (precision === 0) return `${negative ? "-" : ""}${whole}`;
  let fraction = (absolute % scale).toString().padStart(precision, "0");
  if (trim) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function formatRatio(numerator: bigint, denominator: bigint, decimals: number): string | null {
  if (denominator === BigInt(0)) return null;
  const rounded = roundRatioHalfUp(numerator * pow10(decimals), denominator);
  return formatScaled(rounded, decimals, false);
}

function formatPercent(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  const tenthsPercent = roundRatioHalfUp(BigInt(numerator) * BigInt(1000), BigInt(denominator));
  return `${formatScaled(tenthsPercent, 1, false)}%`;
}

function summarize(stats: ExactStats, scorePrecision: number): PerformanceStats {
  const games = BigInt(stats.gamesPlayed);
  const displayPrecision = Math.max(scorePrecision, 1);
  const scoreAverageUnits = games === BigInt(0)
    ? null
    : roundRatioHalfUp(stats.scoreUnits * pow10(displayPrecision), games * pow10(scorePrecision));

  return {
    gamesPlayed: stats.gamesPlayed,
    firsts: stats.firsts,
    seconds: stats.seconds,
    thirds: stats.thirds,
    fourths: stats.fourths,
    averageRank: formatRatio(BigInt(stats.rankTotal), games, 2),
    topRate: formatPercent(stats.firsts, stats.gamesPlayed),
    reachRate: formatPercent(stats.firsts + stats.seconds, stats.gamesPlayed),
    bustAvoidanceRate: formatPercent(stats.gamesPlayed - stats.fourths, stats.gamesPlayed),
    scoreTotal: formatScaled(stats.scoreUnits, scorePrecision),
    scoreAverage: scoreAverageUnits === null ? null : formatScaled(scoreAverageUnits, displayPrecision, false),
    maxWinStreak: stats.maxWinStreak,
    currentWinStreak: stats.currentWinStreak,
  };
}

function buildExactStats(
  customers: readonly PerformanceCustomer[],
  results: readonly PerformanceResult[],
): { byCustomer: Map<string, ExactStats>; scorePrecision: number } {
  const scorePrecision = results.reduce((maximum, result) => Math.max(maximum, result.scorePrecision), 0);
  const byCustomer = new Map<string, ExactStats>();
  for (const customer of customers) {
    byCustomer.set(customer.id, {
      customer, gamesPlayed: 0, firsts: 0, seconds: 0, thirds: 0, fourths: 0,
      rankTotal: 0, scoreUnits: BigInt(0), currentWinStreak: 0, maxWinStreak: 0,
    });
  }

  const grouped = new Map<string, PerformanceResult[]>();
  for (const result of results) {
    if (!Number.isInteger(result.scorePrecision) || result.scorePrecision < 0 || result.scorePrecision > SCORE_PRECISION_LIMIT) throw new Error("Game ruleSnapshot scorePrecision is invalid.");
    if (!Number.isInteger(result.rank) || result.rank < 1 || result.rank > 4) throw new Error("GamePlayerResult rank is invalid.");
    const stats = byCustomer.get(result.customerId);
    if (!stats) continue;
    stats.gamesPlayed += 1;
    stats.rankTotal += result.rank;
    if (result.rank === 1) stats.firsts += 1;
    else if (result.rank === 2) stats.seconds += 1;
    else if (result.rank === 3) stats.thirds += 1;
    else stats.fourths += 1;
    stats.scoreUnits += BigInt(result.scoreScaled) * pow10(scorePrecision - result.scorePrecision);
    const customerResults = grouped.get(result.customerId) ?? [];
    customerResults.push(result);
    grouped.set(result.customerId, customerResults);
  }

  for (const [customerId, customerResults] of grouped) {
    const stats = byCustomer.get(customerId)!;
    customerResults.sort(compareChronologically);
    let streak = 0;
    for (const result of customerResults) {
      streak = result.rank === 1 ? streak + 1 : 0;
      stats.maxWinStreak = Math.max(stats.maxWinStreak, streak);
    }
    stats.currentWinStreak = streak;
  }

  return { byCustomer, scorePrecision };
}

export function calculateCustomerPerformance(results: readonly PerformanceResult[], customer: PerformanceCustomer): PerformanceStats {
  const exact = buildExactStats([customer], results);
  return summarize(exact.byCustomer.get(customer.id)!, exact.scorePrecision);
}

function compareRatio(leftNumerator: bigint, leftDenominator: bigint, rightNumerator: bigint, rightDenominator: bigint): number {
  const left = leftNumerator * rightDenominator;
  const right = rightNumerator * leftDenominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrimary(metric: RankingMetricKey, left: ExactStats, right: ExactStats): number {
  if (metric === "scoreTotal") return left.scoreUnits > right.scoreUnits ? -1 : left.scoreUnits < right.scoreUnits ? 1 : 0;
  if (metric === "gamesPlayed") return right.gamesPlayed - left.gamesPlayed;
  if (metric === "maxWinStreak") return right.maxWinStreak - left.maxWinStreak;
  if (metric === "averageRank") return compareRatio(BigInt(left.rankTotal), BigInt(left.gamesPlayed), BigInt(right.rankTotal), BigInt(right.gamesPlayed));
  const leftNumerator = metric === "topRate" ? left.firsts
    : metric === "reachRate" ? left.firsts + left.seconds
      : left.gamesPlayed - left.fourths;
  const rightNumerator = metric === "topRate" ? right.firsts
    : metric === "reachRate" ? right.firsts + right.seconds
      : right.gamesPlayed - right.fourths;
  return -compareRatio(BigInt(leftNumerator), BigInt(left.gamesPlayed), BigInt(rightNumerator), BigInt(right.gamesPlayed));
}

export function buildRankingRows(
  customers: readonly PerformanceCustomer[],
  results: readonly PerformanceResult[],
  minimumGames: number,
  metric: RankingMetricKey = "scoreTotal",
): RankingRow[] {
  if (!Number.isInteger(minimumGames) || minimumGames < 1) throw new Error("minimumGames must be a positive integer.");
  // Ranking eligibility and personal history are separate concerns: callers may
  // aggregate an inactive customer for an internal detail page, while ranking
  // rows must continue to contain active customers only.
  const rankingCustomers = customers.filter((customer) => customer.isActive);
  const { byCustomer, scorePrecision } = buildExactStats(rankingCustomers, results);
  const ordered = [...byCustomer.values()].sort((left, right) => {
    const leftEligible = left.gamesPlayed >= minimumGames;
    const rightEligible = right.gamesPlayed >= minimumGames;
    if (leftEligible !== rightEligible) return leftEligible ? -1 : 1;
    const primary = comparePrimary(metric, left, right);
    return primary || left.customer.internalName.localeCompare(right.customer.internalName, "ja") || left.customer.id.localeCompare(right.customer.id);
  });
  let previousRanked: ExactStats | undefined;
  let previousPlacement = 0;
  let rankedCount = 0;
  return ordered.map((exact) => {
    const eligible = exact.gamesPlayed >= minimumGames;
    let placement: number | null = null;
    if (eligible) {
      rankedCount += 1;
      placement = previousRanked && comparePrimary(metric, previousRanked, exact) === 0 ? previousPlacement : rankedCount;
      previousRanked = exact;
      previousPlacement = placement;
    }
    return {
      customerId: exact.customer.id,
      internalName: exact.customer.internalName,
      gamesPlayed: exact.gamesPlayed,
      placement,
      eligible,
      stats: summarize(exact, scorePrecision),
    };
  });
}
