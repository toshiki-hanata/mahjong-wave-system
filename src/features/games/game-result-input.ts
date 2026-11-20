import { z } from "zod";
import { calculateGame, InvalidFinalPointsError, type GameRule } from "./game-calculation";

const integer = z.number().int().safe();
const positions = <T extends { position: number }>(rows: T[]) => rows.length === 4 && new Set(rows.map(r => r.position)).size === 4;
const points = z.array(z.object({ position: integer.min(1).max(4), finalPoints: integer })).length(4).refine(positions, "4人の座席を重複なく指定してください。");
const ranks = z.array(z.object({ position: integer.min(1).max(4), rank: integer.min(1).max(4) })).length(4).refine(rows => positions(rows) && new Set(rows.map(r => r.rank)).size === 4, "1位から4位に異なる4人を選んでください。");
export const gameResultInputSchema = z.union([
  z.object({ inputMode: z.literal("POINTS").default("POINTS"), points }),
  z.object({ inputMode: z.literal("RANK_ONLY"), ranks }),
]);
export type GameResultsInput = z.input<typeof gameResultInputSchema>;
export type EnteredGameResult = { visitId: string; customerId: string; position: number; rank: number; finalPoints: number | null; scoreScaled: number | null };
type Participant = { visitId: string; customerId: string; position: number };

export function normalizeGameResults(raw: GameResultsInput) {
  const parsed = gameResultInputSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidFinalPointsError("4人の点数、または1位から4位の着順を重複なく入力してください。");
  return parsed.data.inputMode === "RANK_ONLY"
    ? { inputMode: "RANK_ONLY" as const, entries: [...parsed.data.ranks].sort((a, b) => a.position - b.position).map(r => ({ position: r.position, rank: r.rank, finalPoints: null })) }
    : { inputMode: "POINTS" as const, entries: [...parsed.data.points].sort((a, b) => a.position - b.position).map(r => ({ position: r.position, finalPoints: r.finalPoints, rank: null })) };
}
export function calculateEnteredGame(raw: GameResultsInput, participants: readonly Participant[], rule: GameRule): EnteredGameResult[] {
  const input = normalizeGameResults(raw);
  if (participants.length !== 4 || new Set(participants.map(p => p.visitId)).size !== 4 || new Set(participants.map(p => p.customerId)).size !== 4 || new Set(participants.map(p => p.position)).size !== 4 || ![1, 2, 3, 4].every(position => participants.some(p => p.position === position))) throw new InvalidFinalPointsError("位置1〜4の異なる4名を指定してください。");
  if (input.inputMode === "RANK_ONLY") return input.entries.map(r => ({ ...participants.find(p => p.position === r.position)!, rank: r.rank!, finalPoints: null, scoreScaled: null })).sort((a, b) => a.rank - b.rank);
  return calculateGame(input.entries.map(r => ({ ...participants.find(p => p.position === r.position)!, finalPoints: r.finalPoints! })), rule);
}
export function sameEnteredResults(prior: readonly { position: number; rank: number; finalPoints: number | null }[], raw: GameResultsInput): boolean {
  const input = normalizeGameResults(raw), sorted = [...prior].sort((a, b) => a.position - b.position);
  return sorted.length === input.entries.length && sorted.every((r, i) => r.position === input.entries[i]?.position && (input.inputMode === "RANK_ONLY" ? r.finalPoints === null && r.rank === input.entries[i]?.rank : r.finalPoints !== null && r.finalPoints === input.entries[i]?.finalPoints));
}
