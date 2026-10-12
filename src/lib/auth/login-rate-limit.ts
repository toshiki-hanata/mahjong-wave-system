import "server-only";

import { createHmac } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const LOGIN_RATE_LIMIT_POLICY = {
  windowMs: 15 * 60 * 1000,
  maxIpFailures: 30,
  accountDelayAfter: 3,
  maxAccountDelayMs: 2_000,
  retentionMs: 24 * 60 * 60 * 1000,
} as const;

type BucketKey = { dimension: "IP" | "LOGIN_ID"; bucketKey: string };
export type LoginAttemptReservation = {
  allowed: boolean;
  delayMs: number;
  keys: BucketKey[];
};
type Database = Pick<PrismaClient, "$transaction">;

export function normalizeLoginIdForRateLimit(loginId: string): string {
  return loginId.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function createLoginBucketKeys(loginId: string, clientAddress: string, secret: string): BucketKey[] {
  const hash = (dimension: string, value: string) => createHmac("sha256", secret)
    .update(`mahjong-login-rate:v1:${dimension}:${value}`)
    .digest("hex");
  return [
    { dimension: "IP", bucketKey: hash("ip", clientAddress || "unknown") },
    { dimension: "LOGIN_ID", bucketKey: hash("login-id", normalizeLoginIdForRateLimit(loginId)) },
  ];
}

export function progressiveLoginDelay(previousFailures: number): number {
  if (previousFailures < LOGIN_RATE_LIMIT_POLICY.accountDelayAfter) return 0;
  const exponent = previousFailures - LOGIN_RATE_LIMIT_POLICY.accountDelayAfter;
  return Math.min(LOGIN_RATE_LIMIT_POLICY.maxAccountDelayMs, 100 * 2 ** exponent);
}

/**
 * Reserves an attempt atomically in PostgreSQL before password verification.
 * LOGIN_ID failures add a capped delay; IP failures enforce a generous hard cap.
 * Only keyed HMAC values are persisted, never the login ID or source IP.
 */
export async function reserveLoginAttempt(
  database: Database,
  loginId: string,
  clientAddress: string,
  secret: string,
  now = new Date(),
): Promise<LoginAttemptReservation> {
  const keys = createLoginBucketKeys(loginId, clientAddress, secret);
  const staleBefore = new Date(now.getTime() - LOGIN_RATE_LIMIT_POLICY.retentionMs);
  const windowStartedAt = new Date(now.getTime() - LOGIN_RATE_LIMIT_POLICY.windowMs);

  const result = await database.$transaction(async (tx) => {
    // Keep the operational table bounded without touching business history.
    await tx.$executeRaw`
      DELETE FROM "LoginAttemptBucket"
      WHERE "id" IN (
        SELECT "id" FROM "LoginAttemptBucket"
        WHERE "windowStartedAt" < ${staleBefore}
        ORDER BY "windowStartedAt"
        LIMIT 100
      )`;

    await tx.loginAttemptBucket.createMany({
      data: keys.map(({ bucketKey, dimension }) => ({ bucketKey, dimension, failureCount: 0, windowStartedAt: now })),
      skipDuplicates: true,
    });
    const rows = await tx.$queryRaw<Array<{ bucketKey: string; dimension: "IP" | "LOGIN_ID"; failureCount: number; windowStartedAt: Date }>>`
      SELECT "bucketKey", "dimension", "failureCount", "windowStartedAt"
      FROM "LoginAttemptBucket"
      WHERE "bucketKey" IN (${Prisma.join(keys.map(({ bucketKey }) => bucketKey))})
      ORDER BY "bucketKey"
      FOR UPDATE`;
    const byDimension = new Map(rows.map((row) => [row.dimension, row]));
    const ip = byDimension.get("IP");
    const account = byDimension.get("LOGIN_ID");
    if (!ip || !account) throw new Error("Login rate-limit bucket could not be initialized.");

    const ipCount = ip.windowStartedAt < windowStartedAt ? 0 : ip.failureCount;
    const accountCount = account.windowStartedAt < windowStartedAt ? 0 : account.failureCount;
    const delayMs = progressiveLoginDelay(accountCount);
    if (ipCount >= LOGIN_RATE_LIMIT_POLICY.maxIpFailures) {
      if (ipCount !== ip.failureCount || ip.windowStartedAt < windowStartedAt) {
        await tx.loginAttemptBucket.update({
          where: { bucketKey: ip.bucketKey },
          data: { failureCount: ipCount, windowStartedAt: now, updatedAt: now },
        });
      }
      return { allowed: false, delayMs: 0 };
    }

    await Promise.all([
      tx.loginAttemptBucket.update({
        where: { bucketKey: ip.bucketKey },
        data: { failureCount: ipCount + 1, windowStartedAt: ip.windowStartedAt < windowStartedAt ? now : ip.windowStartedAt, updatedAt: now },
      }),
      tx.loginAttemptBucket.update({
        where: { bucketKey: account.bucketKey },
        data: { failureCount: accountCount + 1, windowStartedAt: account.windowStartedAt < windowStartedAt ? now : account.windowStartedAt, updatedAt: now },
      }),
    ]);
    return { allowed: true, delayMs };
  });

  return { ...result, keys };
}

/** A correct password clears that login ID's failures and releases its reserved IP attempt. */
export async function completeSuccessfulLogin(database: Database, reservation: LoginAttemptReservation, now = new Date()): Promise<void> {
  if (!reservation.allowed) return;
  const ip = reservation.keys.find((key) => key.dimension === "IP");
  const loginId = reservation.keys.find((key) => key.dimension === "LOGIN_ID");
  if (!ip || !loginId) throw new Error("Login rate-limit reservation is incomplete.");
  await database.$transaction(async (tx) => {
    await tx.loginAttemptBucket.updateMany({
      where: { bucketKey: loginId.bucketKey },
      data: { failureCount: 0, windowStartedAt: now, updatedAt: now },
    });
    await tx.loginAttemptBucket.updateMany({
      where: { bucketKey: ip.bucketKey, failureCount: { gt: 0 } },
      data: { failureCount: { decrement: 1 }, updatedAt: now },
    });
  });
}

export type LoginRateLimitDatabaseRow = Prisma.LoginAttemptBucketGetPayload<object>;
