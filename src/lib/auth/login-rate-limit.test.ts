import { describe, expect, it } from "vitest";
import { completeSuccessfulLogin, createLoginBucketKeys, LOGIN_RATE_LIMIT_POLICY, normalizeLoginIdForRateLimit, progressiveLoginDelay, reserveLoginAttempt } from "./login-rate-limit";

function memoryDatabase() {
  const rows = new Map<string, { bucketKey: string; dimension: "IP" | "LOGIN_ID"; failureCount: number; windowStartedAt: Date }>();
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [...rows.values()].sort((a, b) => a.bucketKey.localeCompare(b.bucketKey)),
    loginAttemptBucket: {
      createMany: async ({ data }: { data: Array<{ bucketKey: string; dimension: "IP" | "LOGIN_ID"; failureCount: number; windowStartedAt: Date }> }) => {
        for (const row of data) if (!rows.has(row.bucketKey)) rows.set(row.bucketKey, { ...row });
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { bucketKey: string }; data: Record<string, unknown> }) => {
        const row = rows.get(where.bucketKey)!;
        if (typeof data.failureCount === "number") row.failureCount = data.failureCount;
        if (typeof data.windowStartedAt === "object" && data.windowStartedAt instanceof Date) row.windowStartedAt = data.windowStartedAt;
        if (typeof data.updatedAt === "object" && data.updatedAt instanceof Date) { /* Prisma-managed timestamp in database. */ }
        return row;
      },
      updateMany: async ({ where, data }: { where: { bucketKey: string; failureCount?: { gt: number } }; data: Record<string, unknown> }) => {
        const row = rows.get(where.bucketKey);
        if (!row || (where.failureCount?.gt !== undefined && row.failureCount <= where.failureCount.gt)) return { count: 0 };
        if (data.failureCount === 0) row.failureCount = 0;
        else if (typeof data.failureCount === "object" && data.failureCount !== null && "decrement" in data.failureCount) row.failureCount = Math.max(0, row.failureCount - Number((data.failureCount as { decrement: number }).decrement));
        if (data.windowStartedAt instanceof Date) row.windowStartedAt = data.windowStartedAt;
        return { count: 1 };
      },
    },
  };
  return { $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx), rows };
}

describe("distributed login attempt policy", () => {
  it("keeps login identifiers normalized and stores only keyed digests", () => {
    expect(normalizeLoginIdForRateLimit("  HANAta ")).toBe("hanata");
    const first = createLoginBucketKeys("Hanata", "192.0.2.1", "unit-test-secret");
    const caseVariant = createLoginBucketKeys(" hanata ", "192.0.2.2", "unit-test-secret");
    expect(first[1]?.bucketKey).toBe(caseVariant[1]?.bucketKey);
    expect(first[0]?.bucketKey).not.toBe(caseVariant[0]?.bucketKey);
    expect(first.every((key) => /^[a-f0-9]{64}$/.test(key.bucketKey))).toBe(true);
    expect(first.some((key) => key.bucketKey.includes("hanata") || key.bucketKey.includes("192.0.2.1"))).toBe(false);
  });

  it("uses a generous shared-IP cap and progressive per-account delay without account lockout", () => {
    expect(LOGIN_RATE_LIMIT_POLICY.maxIpFailures).toBeGreaterThan(10);
    expect(progressiveLoginDelay(0)).toBe(0);
    expect(progressiveLoginDelay(3)).toBe(100);
    expect(progressiveLoginDelay(10)).toBe(LOGIN_RATE_LIMIT_POLICY.maxAccountDelayMs);
    expect(LOGIN_RATE_LIMIT_POLICY.maxAccountDelayMs).toBeLessThanOrEqual(2_000);
  });

  it("tracks a login ID across changing IPs and clears failures after a successful login", async () => {
    const database = memoryDatabase();
    const now = new Date("2026-10-12T00:00:00Z");
    const first = await reserveLoginAttempt(database as never, "hanata", "ip-a", "unit-test-secret", now);
    const second = await reserveLoginAttempt(database as never, "hanata", "ip-b", "unit-test-secret", now);
    const third = await reserveLoginAttempt(database as never, "hanata", "ip-c", "unit-test-secret", now);
    const fourth = await reserveLoginAttempt(database as never, "hanata", "ip-d", "unit-test-secret", now);
    expect([first.delayMs, second.delayMs, third.delayMs, fourth.delayMs]).toEqual([0, 0, 0, 100]);
    await completeSuccessfulLogin(database as never, fourth, now);
    const next = await reserveLoginAttempt(database as never, "hanata", "ip-e", "unit-test-secret", now);
    expect(next.delayMs).toBe(0);
  });

  it("enforces the shared IP threshold while leaving the account bucket available", async () => {
    const database = memoryDatabase();
    const now = new Date("2026-10-12T00:00:00Z");
    let reservation;
    for (let index = 0; index < LOGIN_RATE_LIMIT_POLICY.maxIpFailures; index += 1) {
      reservation = await reserveLoginAttempt(database as never, `user-${index}`, "one-ip", "unit-test-secret", now);
      expect(reservation.allowed).toBe(true);
    }
    const blocked = await reserveLoginAttempt(database as never, "next-user", "one-ip", "unit-test-secret", now);
    expect(blocked.allowed).toBe(false);
  });
});
