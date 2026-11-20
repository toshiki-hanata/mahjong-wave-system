import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { acknowledgeMfaCodes, completeMfaChallenge, getMfaChallengeView, recoverMfaChallenge } from "./service";
const query = vi.fn(), transaction = vi.fn();
const database = { staffMfaChallenge: { findUnique: query }, $transaction: transaction } as unknown as PrismaClient;
beforeEach(() => vi.clearAllMocks());
describe("anonymous MFA service boundaries", () => {
  it.each([null, "", "bad", "x".repeat(10000)])("rejects an absent or malformed pending identity before any database operation %#", async token => {
    expect(await getMfaChallengeView(database, token)).toBeNull();
    expect((await completeMfaChallenge(database, token, "123456", "")).status).toBe("INVALID");
    expect((await recoverMfaChallenge(database, token, "a".repeat(32))).status).toBe("INVALID");
    expect((await acknowledgeMfaCodes(database, token)).status).toBe("INVALID");
    expect(query).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
});
