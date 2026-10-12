import { describe, expect, it, vi } from "vitest";
import { assertDatabaseTestEnvironment, DbTestSafetyError, type DbTestSafetyConfig } from "./db-test-safety";

const valid: DbTestSafetyConfig = {
  enabled: true,
  environmentId: "b6400e42-4ac6-4972-8dc3-8b7e75fd7031",
  nodeEnv: "test",
  vercelEnv: "preview",
  databaseUrl: "postgresql://app@ep-example-pooler.region.aws.neon.tech/db?sslmode=require",
  directUrl: "postgresql://app@ep-example.region.aws.neon.tech/db?sslmode=require",
};

describe("database integration safety gate", () => {
  it("rejects production before querying the database marker", async () => {
    const markerReader = vi.fn(async () => valid.environmentId ?? null);
    await expect(assertDatabaseTestEnvironment({ ...valid, nodeEnv: "production" }, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    await expect(assertDatabaseTestEnvironment({ ...valid, nodeEnv: "test", vercelEnv: "production" }, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    expect(markerReader).not.toHaveBeenCalled();
  });

  it("fails closed for an indeterminate runtime before querying the marker", async () => {
    const markerReader = vi.fn(async () => valid.environmentId ?? null);
    await expect(assertDatabaseTestEnvironment({ ...valid, nodeEnv: undefined, vercelEnv: undefined }, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    expect(markerReader).not.toHaveBeenCalled();
  });

  it("rejects a flag-only request and mismatched or unmarked databases", async () => {
    const markerReader = vi.fn(async () => "another-environment-id");
    await expect(assertDatabaseTestEnvironment({ ...valid, environmentId: undefined }, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    await expect(assertDatabaseTestEnvironment({ ...valid, directUrl: "postgresql://app@other.region.aws.neon.tech/db" }, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    await expect(assertDatabaseTestEnvironment(valid, markerReader)).rejects.toBeInstanceOf(DbTestSafetyError);
    expect(markerReader).toHaveBeenCalledTimes(1);
  });

  it("allows a specifically marked test database only when both URLs match", async () => {
    await expect(assertDatabaseTestEnvironment(valid, async () => valid.environmentId ?? null)).resolves.toBeUndefined();
  });
});
