import "server-only";

export class DatabaseConfigurationError extends Error {
  constructor() { super("データベースの安全設定を確認してください。"); }
}

export function normalizedDatabaseHost(host: string): string {
  return host.toLowerCase().replace("-pooler.", ".");
}

export function productionDatabaseChecksRequired(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}

/** Returns a server-only URL. Never log this value or include it in validation errors. */
export function runtimeDatabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  if (!env.DATABASE_URL) {
    if (env.VERCEL === "1" || env.VERCEL_ENV) throw new DatabaseConfigurationError();
    return undefined;
  }
  try {
    const url = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.searchParams.has("host")) throw new DatabaseConfigurationError();
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!local || productionDatabaseChecksRequired(env)) {
      if (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "require") throw new DatabaseConfigurationError();
      if (url.searchParams.has("sslaccept") && url.searchParams.get("sslaccept") !== "strict") throw new DatabaseConfigurationError();
      url.searchParams.set("sslmode", "require");
      url.searchParams.set("sslaccept", "strict");
    }
    if (env.VERCEL === "1" || env.VERCEL_ENV) {
      if (/(?:^|\s)--inspect(?:[-=]|$)/.test(env.NODE_OPTIONS ?? "")) throw new DatabaseConfigurationError();
      const production = env.VERCEL_ENV === "production";
      const label = env.DATABASE_ENVIRONMENT;
      const pin = env.PRODUCTION_DATABASE_HOST;
      if (!pin || !/^[a-z0-9.-]+$/i.test(pin)) throw new DatabaseConfigurationError();
      const sameProduction = normalizedDatabaseHost(url.hostname) === normalizedDatabaseHost(pin);
      if (production ? label !== "production" || !sameProduction : !["preview", "test", "development"].includes(label ?? "") || sameProduction) throw new DatabaseConfigurationError();
      const origin = new URL(env.APP_ORIGIN ?? "");
      if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN) throw new DatabaseConfigurationError();
      if (!env.APP_DATABASE_ROLE || decodeURIComponent(url.username) !== env.APP_DATABASE_ROLE) throw new DatabaseConfigurationError();
      // Runtime direct connections use the same least-privilege role. Migration-owner credentials stay outside Vercel.
      if (env.DIRECT_URL) {
        const direct = new URL(env.DIRECT_URL);
        if (decodeURIComponent(direct.username) !== env.APP_DATABASE_ROLE || normalizedDatabaseHost(direct.hostname) !== normalizedDatabaseHost(url.hostname) || direct.pathname !== url.pathname || direct.searchParams.has("host") || direct.searchParams.get("sslmode") !== "require" || direct.searchParams.get("sslaccept") !== "strict") throw new DatabaseConfigurationError();
      }
    }
    return url.toString();
  } catch { throw new DatabaseConfigurationError(); }
}
