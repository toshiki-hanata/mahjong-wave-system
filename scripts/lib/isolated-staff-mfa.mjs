import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseTestEnvironment } from "../../src/test/db-test-safety.ts";

const root = path.resolve(import.meta.dirname, "../..");
function strictUrl(value) {
  const url = new URL(value ?? "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.has("host")) throw new Error("Invalid test connection");
  if (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "require") throw new Error("TLS must remain enabled");
  if (url.searchParams.has("sslaccept") && url.searchParams.get("sslaccept") !== "strict") throw new Error("Certificate verification must remain enabled");
  url.searchParams.set("sslmode", "require"); url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("connect_timeout", "20");
  return url;
}

/** Owns one new random schema in a previously marked development DB, and always removes only that schema. */
export async function withIsolatedStaffMfaEnvironment(callback) {
  let source, fixture, created = false, removed = false, stage = "safety";
  const schema = "mfa_test_" + randomUUID().replaceAll("-", "");
  try {
    if (process.env.RUN_STAFF_MFA_ISOLATED_TESTS !== "true" || process.env.NODE_ENV === "production" || process.env.DATABASE_ENVIRONMENT === "production" || process.env.VERCEL === "1" || process.env.VERCEL_ENV) throw new Error("Explicit non-production execution is required");
    const app = strictUrl(process.env.DATABASE_URL), direct = strictUrl(process.env.DIRECT_URL);
    source = new PrismaClient({ datasourceUrl: direct.toString(), errorFormat: "minimal", log: [] });
    stage = "marker";
    await assertDatabaseTestEnvironment({ enabled: true, nodeEnv: "test", environmentId: process.env.DB_TEST_ENVIRONMENT_ID, databaseUrl: app.toString(), directUrl: direct.toString() }, async () => (await source.databaseTestMarker.findUnique({ where: { id: 1 }, select: { environmentId: true } }))?.environmentId ?? null);
    const initial = await source.$queryRaw`SELECT oid FROM pg_namespace WHERE nspname = ${schema}`;
    if (initial.length || !/^mfa_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Disposable target is not exclusively new");
    stage = "generate-sql";
    const sql = execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--script"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const migration = readFileSync(path.join(root, "prisma/migrations/20261116090000_staff_mfa/migration.sql"), "utf8");
    const checkStart = migration.indexOf('ALTER TABLE "StaffMfa" ALTER COLUMN');
    if (checkStart < 0) throw new Error("MFA constraints missing");
    const isolatedSql = sql.replace('CREATE SCHEMA IF NOT EXISTS "public";', "") + "\n" + migration.slice(checkStart).replace(/^\s*COMMIT;\s*$/gm, "");
    if (/"public"\s*\./.test(isolatedSql) || /\b(?:DROP SCHEMA|ALTER ROLE|CREATE ROLE|TRUNCATE)\b/i.test(isolatedSql) || /^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/im.test(isolatedSql)) throw new Error("SQL escapes the disposable schema");
    stage = "create-disposable-schema";
    await source.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const statement of isolatedSql.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."DatabaseTestMarker" ("id", "environmentId") VALUES (1, $1)`, process.env.DB_TEST_ENVIRONMENT_ID);
    }, { timeout: 120000 });
    created = true;
    stage = "verification";
    app.searchParams.set("schema", schema); direct.searchParams.set("schema", schema);
    const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: app.toString(), DIRECT_URL: direct.toString(), STAFF_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"), RUN_STAFF_MFA_DB_TESTS: "true" };
    fixture = new PrismaClient({ datasourceUrl: app.toString(), errorFormat: "minimal", log: [] });
    return await callback({ env, database: fixture });
  } catch (error) {
    console.log(JSON.stringify({ isolatedMfaFailureStage: stage, errorClass: error?.constructor?.name ?? "Error", errorCode: typeof error?.code === "string" ? error.code : undefined, databaseErrorCode: typeof error?.errorCode === "string" ? error.errorCode : typeof error?.meta?.code === "string" ? error.meta.code : undefined }));
    throw new Error("Isolated MFA verification stopped at " + stage, { cause: error });
  } finally {
    await fixture?.$disconnect();
    if (source && created) {
      try {
        const owned = await source.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname = ${schema} AND nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)`;
        if (owned.length !== 1 || !/^mfa_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Unsafe cleanup target");
        await source.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        removed = (await source.$queryRaw`SELECT oid FROM pg_namespace WHERE nspname = ${schema}`).length === 0;
      } catch { removed = false; } finally { await source.$disconnect(); }
    } else await source?.$disconnect();
    console.log(JSON.stringify({ temporarySchemaCreated: created, temporarySchemaRemoved: removed, existingSchemaMigrated: false, externalSettingsChanged: false, ...(created && !removed ? { ownedSchemaRequiringReview: schema } : {}) }));
    if (created && !removed) throw new Error("Owned test schema cleanup was not confirmed");
  }
}
