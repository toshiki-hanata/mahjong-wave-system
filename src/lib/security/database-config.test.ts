import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DatabaseConfigurationError, runtimeDatabaseUrl } from "./database-config";
import { assertRuntimeDatabaseRole } from "./database-role";
const production = { VERCEL: "1", VERCEL_ENV: "production", DATABASE_ENVIRONMENT: "production", PRODUCTION_DATABASE_HOST: "ep-production.example.neon.tech", APP_DATABASE_ROLE: "fixture_app", APP_ORIGIN: "https://app.example", DATABASE_URL: "postgresql://fixture_app:fixture@ep-production-pooler.example.neon.tech/fixture?sslmode=require" };
afterEach(() => vi.restoreAllMocks());
describe("deployment DB boundary", () => {
  it("adds mandatory certificate verification for remote Prisma v6 connections", () => {
    const url = new URL(runtimeDatabaseUrl(production)!);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
  });
  it.each([
    { DATABASE_URL: "" }, { DATABASE_ENVIRONMENT: "development" }, { PRODUCTION_DATABASE_HOST: "ep-other.example.neon.tech" },
    { APP_DATABASE_ROLE: "other_role" }, { APP_ORIGIN: "http://app.example" },
    { DATABASE_URL: production.DATABASE_URL + "&sslaccept=accept_invalid_certs" },
    { DATABASE_URL: production.DATABASE_URL + "&host=other-host" },
    { DIRECT_URL: "postgresql://fixture_owner:fixture@ep-production.example.neon.tech/fixture" },
  ])("fails closed for unsafe production configuration %#", changes => {
    expect(() => runtimeDatabaseUrl({ ...production, ...changes })).toThrow(DatabaseConfigurationError);
  });
  it("prevents a preview from targeting either form of the production endpoint", () => {
    expect(() => runtimeDatabaseUrl({ ...production, VERCEL_ENV: "preview", DATABASE_ENVIRONMENT: "preview" })).toThrow(DatabaseConfigurationError);
    expect(runtimeDatabaseUrl({ ...production, VERCEL_ENV: "preview", DATABASE_ENVIRONMENT: "preview", DATABASE_URL: production.DATABASE_URL.replace("ep-production", "ep-preview") })).toBeTruthy();
  });
  it("does not expose the password or host in a validation error", () => {
    try { runtimeDatabaseUrl({ ...production, APP_DATABASE_ROLE: "wrong" }); } catch (error) { expect(String(error)).not.toMatch(/fixture|neon|postgresql/); }
  });
  it("allows explicitly local test/development configuration without a hosted production label", () => {
    expect(runtimeDatabaseUrl({ NODE_ENV: "test" })).toBeUndefined();
    expect(runtimeDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture" })).toBeTruthy();
  });
  it("rejects owner/audit-modification privileges and does not cache a failure", async () => {
    const query = vi.fn().mockResolvedValue([{ unsafe: true }]);
    const database = { $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">;
    await expect(assertRuntimeDatabaseRole(database, { NODE_ENV: "production" })).rejects.toThrow();
    query.mockResolvedValue([{ unsafe: false }]);
    await expect(assertRuntimeDatabaseRole(database, { NODE_ENV: "production" })).resolves.toBeUndefined();
    await assertRuntimeDatabaseRole(database, { NODE_ENV: "production" });
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("does not enable a hosted permission bypass through a development label", async () => {
    const query = vi.fn().mockResolvedValue([{ unsafe: true }]);
    await expect(assertRuntimeDatabaseRole({ $queryRaw: query } as unknown as Pick<PrismaClient, "$queryRaw">, { NODE_ENV: "development", VERCEL: "1", DATABASE_ENVIRONMENT: "development" })).rejects.toThrow();
  });
});
