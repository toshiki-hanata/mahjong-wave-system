export type DbTestSafetyConfig = {
  enabled: boolean;
  environmentId?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  databaseUrl?: string;
  directUrl?: string;
};

export class DbTestSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbTestSafetyError";
  }
}

function normalizedDatabaseTarget(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace("-pooler.", ".").toLowerCase();
    return `${url.protocol}//${host}${url.pathname}${url.searchParams.get("schema") ?? ""}`;
  } catch {
    return null;
  }
}

export async function assertDatabaseTestEnvironment(
  config: DbTestSafetyConfig,
  readDatabaseMarker: () => Promise<string | null>,
): Promise<void> {
  if (!config.enabled) throw new DbTestSafetyError("Database integration tests were not explicitly enabled.");
  if (config.nodeEnv === "production" || config.vercelEnv === "production") {
    throw new DbTestSafetyError("Database integration tests are forbidden in production environments.");
  }
  if (config.nodeEnv !== "test" && config.vercelEnv !== "development" && config.vercelEnv !== "preview") {
    throw new DbTestSafetyError("Database integration tests require an explicitly non-production runtime environment.");
  }
  if (!config.environmentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.environmentId)) {
    throw new DbTestSafetyError("DB_TEST_ENVIRONMENT_ID must be an explicitly provisioned UUID.");
  }
  if (!config.databaseUrl || !config.directUrl) {
    throw new DbTestSafetyError("Both application and direct database URLs are required for guarded integration tests.");
  }
  const appTarget = normalizedDatabaseTarget(config.databaseUrl);
  const directTarget = normalizedDatabaseTarget(config.directUrl);
  if (!appTarget || appTarget !== directTarget) {
    throw new DbTestSafetyError("DATABASE_URL and DIRECT_URL do not identify the same database target.");
  }

  const marker = await readDatabaseMarker();
  if (marker !== config.environmentId) {
    throw new DbTestSafetyError("The database does not contain the matching non-production test marker.");
  }
}
