// Operator-only provisioning. This file is not a web endpoint and cannot reset an enrolled factor.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { boundEnrollmentHash } from "../src/lib/auth/mfa/keys.ts";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseTestEnvironment } from "../src/test/db-test-safety.ts";

if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
  console.error("Run this operator command in a private, interactive local terminal. It cannot run in hosted jobs or logs.");
  process.exit(1);
}
const encodedKey = process.env.STAFF_MFA_ENCRYPTION_KEY;
if (!encodedKey || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey) || Buffer.from(encodedKey, "base64").toString("base64") !== encodedKey) {
  console.error("Configure the separate 32-byte STAFF_MFA_ENCRYPTION_KEY securely first. No secret was generated or printed.");
  process.exit(1);
}
let database;
const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  const loginId = (await prompt.question("初回登録する管理者のログインID: ")).trim();
  if (!loginId || loginId.length > 120) throw new Error("Invalid target");
  const production = process.env.DATABASE_ENVIRONMENT === "production";
  const phrase = production ? "本番の初回MFA登録コードを発行" : "初回MFA登録コードを発行";
  if (await prompt.question(`対象環境を確認し「${phrase}」と入力: `) !== phrase) throw new Error("Not confirmed");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.has("host") || ![null, "public"].includes(url.searchParams.get("schema"))) throw new Error("Invalid connection");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    if (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "require") throw new Error("TLS required");
    if (url.searchParams.has("sslaccept") && url.searchParams.get("sslaccept") !== "strict") throw new Error("Certificate verification required");
    url.searchParams.set("sslmode", "require"); url.searchParams.set("sslaccept", "strict");
  }
  if (production) {
    const normalize = s => s.toLowerCase().replace("-pooler.", ".");
    if (!process.env.PRODUCTION_DATABASE_HOST || normalize(url.hostname) !== normalize(process.env.PRODUCTION_DATABASE_HOST)) throw new Error("Production target not pinned");
  }
  database = new PrismaClient({ datasourceUrl: url.toString(), log: [], errorFormat: "minimal" });
  if (!production) await assertDatabaseTestEnvironment({ enabled: true, nodeEnv: process.env.NODE_ENV === "production" ? "production" : "test", environmentId: process.env.DB_TEST_ENVIRONMENT_ID, databaseUrl: url.toString(), directUrl: process.env.DIRECT_URL }, async () => (await database.databaseTestMarker.findUnique({ where: { id: 1 }, select: { environmentId: true } }))?.environmentId ?? null);
  const target = await database.staff.findUnique({ where: { loginId }, select: { id: true, storeId: true } });
  if (!target) throw new Error("Unavailable target");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = boundEnrollmentHash(token, { storeId: target.storeId, staffId: target.id });
  await database.$transaction(async tx => {
    const locked = await tx.$queryRaw`SELECT "id" FROM "public"."Store" WHERE "id" = ${target.storeId} FOR UPDATE`;
    if (locked.length !== 1) throw new Error("Unexpected database namespace");
    const staff = await tx.staff.findFirst({ where: { id: target.id, storeId: target.storeId, isActive: true, role: { in: ["OWNER", "MANAGER"] }, store: { isActive: true } }, select: { id: true } });
    const existing = await tx.staffMfa.findUnique({ where: { staffId: target.id } });
    if (!staff || existing?.enabledAt || existing?.secretCiphertext || existing?.recoveryCodeHashes.length) throw new Error("Enrollment is already active or unavailable");
    const times = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const expiresAt = new Date(times[0].now.getTime() + 3600000);
    await tx.staffMfa.upsert({ where: { staffId: target.id },
      create: { staffId: target.id, storeId: target.storeId, enrollmentTokenHash: tokenHash, enrollmentExpiresAt: expiresAt },
      update: { enrollmentTokenHash: tokenHash, enrollmentExpiresAt: expiresAt, version: { increment: 1 } } });
    await tx.staff.update({ where: { id: target.id }, data: { sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { storeId: target.storeId, action: "STAFF_MFA_ENROLLMENT_INVITED", entityType: "StaffMfa", entityId: target.id, metadata: { operatorProvisioned: true } } });
  });
  console.log("初回登録コード（1時間・一度だけ有効）: " + token);
  console.log("本人へ別経路で渡してください。チャット・Git・ログ・画面録画に保存しないでください。再発行すると前の登録コードは失効します。");
} catch {
  console.error("発行できません。対象・権限・接続を確認してください。登録済みMFAの解除には使えません。秘密値は出力しません。");
  process.exitCode = 1;
} finally { prompt.close(); await database?.$disconnect(); }
