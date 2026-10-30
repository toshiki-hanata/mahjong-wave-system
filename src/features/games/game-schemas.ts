import { z } from "zod";

const integer = z.coerce.number().int().safe();
export const storeRuleSchema = z.object({
  startingPoints: integer.min(1), returnPoints: integer.min(1),
  umaFirst: integer, umaSecond: integer, umaThird: integer, umaFourth: integer,
  okaTop: integer, pointUnit: integer.min(1), requiredTotal: integer.min(1),
  allowNegative: z.boolean(), tieBreakRule: z.literal("POSITION_ASC"),
  scorePointDivisor: integer.min(1),
  scorePrecision: integer.min(0).max(3), roundingMode: z.enum(["NONE", "HALF_UP", "DOWN"]),
  isProvisional: z.boolean(),
});

export const gameInputSchema = z.object({
  tableSessionId: z.string().min(1),
  expectedSequence: integer.min(1),
  seatingToken: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
  points: z.array(z.object({ position: integer.min(1).max(4), finalPoints: integer })).length(4),
});

export const gameCorrectionSchema = z.object({
  gameId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(1, "訂正理由を入力してください。").max(500),
  points: z.array(z.object({ position: integer.min(1).max(4), finalPoints: integer })).length(4),
});
