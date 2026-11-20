import { describe, expect, it } from "vitest";
import { applicationDatabaseSchema, applicationSqlTable, qualifiedSqlTableName } from "./sql-namespace";
describe("authentication SQL namespace", () => {
  it("retains the ordinary public default and explicitly targets an isolated schema", () => {
    expect(applicationDatabaseSchema({})).toBe("public");
    const env = { DATABASE_URL: "postgresql://fixture:fixture@example.invalid/fixture?schema=mfa_test_fixture" };
    expect(applicationSqlTable("LoginAttemptBucket", env).sql).toBe('"mfa_test_fixture"."LoginAttemptBucket"');
    expect(qualifiedSqlTableName("StaffMfa", env)).toBe('"mfa_test_fixture"."StaffMfa"');
  });
  it.each(['x";DELETE FROM "Staff";--', "public.other", "", "x".repeat(64)])("rejects unsafe schema syntax before building SQL %#", schema => {
    const url = new URL("postgresql://fixture:fixture@example.invalid/fixture"); url.searchParams.set("schema", schema);
    expect(() => applicationSqlTable("Store", { DATABASE_URL: url.toString() })).toThrow("対象範囲");
  });
});
