// Additive, explicitly enabled development setup. Never creates or changes a real staff MFA enrollment.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseTestEnvironment } from "../src/test/db-test-safety.ts";
const root = path.resolve(import.meta.dirname, ".."), name = "20261116090000_staff_mfa";
let database;
try {
  if (process.env.RUN_STAFF_MFA_DEV_SETUP !== "true" || process.env.NODE_ENV === "production" || process.env.DATABASE_ENVIRONMENT === "production" || process.env.VERCEL === "1" || process.env.VERCEL_ENV) throw new Error("Development setup was not explicitly enabled");
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = new URL(env[key] ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.has("host") || ![null, "public"].includes(url.searchParams.get("schema"))) throw new Error("Unrecognized development target");
    if (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "require") throw new Error("TLS required");
    if (url.searchParams.has("sslaccept") && url.searchParams.get("sslaccept") !== "strict") throw new Error("Certificate verification required");
    url.searchParams.set("sslmode", "require"); url.searchParams.set("sslaccept", "strict"); env[key] = url.toString();
  }
  database = new PrismaClient({ datasourceUrl: env.DIRECT_URL, log: [], errorFormat: "minimal" });
  await assertDatabaseTestEnvironment({ enabled: true, nodeEnv: "test", environmentId: env.DB_TEST_ENVIRONMENT_ID, databaseUrl: env.DATABASE_URL, directUrl: env.DIRECT_URL }, async () => (await database.databaseTestMarker.findUnique({ where: { id: 1 }, select: { environmentId: true } }))?.environmentId ?? null);
  const rows = await database.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
  if (rows.some(r => !r.finished_at && !r.rolled_back_at)) throw new Error("Unfinished migration requires review");
  const applied = new Set(rows.filter(r => r.finished_at && !r.rolled_back_at).map(r => r.migration_name));
  const pending = readdirSync(path.join(root, "prisma/migrations")).filter(n => /^\d/.test(n) && !applied.has(n));
  if (pending.some(n => n !== name)) throw new Error("Unrelated pending migrations require review");
  const sql = readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8");
  if (!sql.trimStart().startsWith("BEGIN;") || !sql.trimEnd().endsWith("COMMIT;") || /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im.test(sql) || /ALTER TABLE "(?:Staff|Customer|Game|PointLedgerEntry)"/.test(sql)) throw new Error("Migration is not the reviewed additive transaction");
  if (pending.length) execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const check = await database.$queryRaw`SELECT to_regclass('"StaffMfa"') IS NOT NULL AS profile, to_regclass('"StaffMfaChallenge"') IS NOT NULL AS challenge`;
  if (!check[0]?.profile || !check[0]?.challenge) throw new Error("MFA tables were not confirmed");
  const key = process.env.STAFF_MFA_ENCRYPTION_KEY;
  if (key && (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, "base64").toString("base64") !== key)) throw new Error("Existing MFA encryption key requires review; never overwrite it");
  if (!key) {
    // Append only: existing connection/account/session values and their file permissions remain intact.
    appendFileSync(path.join(root, ".env"), "\n# Separate local staff MFA encryption key. Keep a protected backup; do not rotate by overwriting.\nSTAFF_MFA_ENCRYPTION_KEY=" + randomBytes(32).toString("base64") + "\n");
  }
  console.log(JSON.stringify({ developmentMarkerVerified: true, migration: name, migrationAppliedNow: pending.length === 1, encryptionKeyConfigured: true, keyPrinted: false, staffEnrollmentChanged: false, productionChanged: false }));
} catch {
  console.error("Development MFA setup stopped. Review the marker, pending migrations and local key; no raw connection or secret is printed.");
  process.exitCode = 1;
} finally { await database?.$disconnect(); }
