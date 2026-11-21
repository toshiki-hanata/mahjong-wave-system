import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { legacyPointsSchema } from "./legacy-points-service";
const base = { customerId: "synthetic", requestKey: randomUUID(), expectedBalance: 0, expectedImported: null, amount: 0, source: "NO_CARD", reason: "新規会員の確認", personConfirmed: true, rosterConfirmed: true, cardConfirmed: true, duplicateChecked: true };
describe("legacy point evidence and bounded amounts", () => {
  it("allows a deliberate zero confirmation, not an inferred zero balance", () => expect(legacyPointsSchema.parse(base).amount).toBe(0));
  it.each(["personConfirmed", "rosterConfirmed", "cardConfirmed", "duplicateChecked"])("requires %s", flag => expect(legacyPointsSchema.safeParse({ ...base, [flag]: false }).success).toBe(false));
  it("requires a physical-card check for nonzero imports and corrections", () => { expect(legacyPointsSchema.safeParse({ ...base, amount: 1 }).success).toBe(false); expect(legacyPointsSchema.safeParse({ ...base, expectedImported: 10 }).success).toBe(false); expect(legacyPointsSchema.safeParse({ ...base, amount: 12, source: "VISUAL" }).success).toBe(true); });
  it.each([-1, 0.1, 2147483648, NaN, Infinity])("rejects invalid point totals %s", amount => expect(legacyPointsSchema.safeParse({ ...base, source: "VISUAL", amount }).success).toBe(false));
});
