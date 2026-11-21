import "server-only";
import { applicationDatabaseSchema, qualifiedSqlTableName } from "./sql-namespace";
import type { PrismaClient } from "@prisma/client";
import { productionDatabaseChecksRequired } from "./database-config";

const checked = new WeakMap<object, { until: number; promise: Promise<void> }>();

/** Enforces least privilege before authenticated access; does not grant or revoke any external privilege. */
export async function assertRuntimeDatabaseRole(database: Pick<PrismaClient, "$queryRaw">, env: Readonly<Record<string, string | undefined>> = process.env): Promise<void> {
  if (!productionDatabaseChecksRequired(env)) return;
  const cached = checked.get(database);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = (async () => {
    const rows = await database.$queryRaw<Array<{ unsafe: boolean }>>`
      SELECT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.oid = d.datdba
        OR EXISTS (SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolcreatedb OR elevated.rolcreaterole OR elevated.rolbypassrls OR elevated.oid = d.datdba) AND pg_has_role(current_user, elevated.oid, 'MEMBER'))
        OR has_schema_privilege(current_user, ${applicationDatabaseSchema(env)}, 'CREATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("AuditLog", env)}, 'UPDATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("AuditLog", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("PointLedgerEntry", env)}, 'UPDATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("PointLedgerEntry", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("StaffMfa", env)}, 'INSERT')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("StaffMfa", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("LegacyPointMigration", env)}, 'UPDATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("LegacyPointMigration", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("LegacyPointChange", env)}, 'UPDATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("LegacyPointChange", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("DailyReportRequest", env)}, 'UPDATE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("DailyReportRequest", env)}, 'DELETE')
        OR has_table_privilege(current_user, ${qualifiedSqlTableName("DailyReportCashEntry", env)}, 'DELETE')
        OR has_column_privilege(current_user, ${qualifiedSqlTableName("DailyReportCashEntry", env)}, 'amountYen', 'UPDATE')) AS unsafe
      FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
      WHERE r.rolname = current_user`;
    if (rows.length !== 1 || rows[0].unsafe !== false) throw new Error("本番用DB権限の確認が必要です。");
  })();
  checked.set(database, { until: Date.now() + 60000, promise });
  try { await promise; } catch { checked.delete(database); throw new Error("本番用DB権限の確認が必要です。"); }
}
