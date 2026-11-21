import "server-only";
import { Prisma } from "@prisma/client";
const tables = new Set(["Store", "LoginAttemptBucket", "AuditLog", "PointLedgerEntry", "StaffMfa", "LegacyPointMigration", "LegacyPointChange", "DailyReportRequest", "DailyReportCashEntry"] as const);
type Table = "Store" | "LoginAttemptBucket" | "AuditLog" | "PointLedgerEntry" | "StaffMfa" | "LegacyPointMigration" | "LegacyPointChange" | "DailyReportRequest" | "DailyReportCashEntry";
export function applicationDatabaseSchema(env: Readonly<Record<string, string | undefined>> = process.env): string {
  try {
    const schema = env.DATABASE_URL ? new URL(env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public";
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema)) throw new Error();
    return schema;
  } catch { throw new Error("データベースの対象範囲を確認してください。"); }
}
export function qualifiedSqlTableName(table: Table, env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (!tables.has(table)) throw new Error("データベースの対象範囲を確認してください。");
  return `"${applicationDatabaseSchema(env)}"."${table}"`;
}
/** Only allowlisted names and validated identifiers become SQL syntax. User data stays bound. */
export function applicationSqlTable(table: Table, env: Readonly<Record<string, string | undefined>> = process.env): Prisma.Sql {
  return Prisma.raw(qualifiedSqlTableName(table, env));
}
