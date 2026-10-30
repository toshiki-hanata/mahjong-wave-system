import "server-only";

export type CustomerAuthConfig = Readonly<{
  origin: string; rpId: string; rpName: string; secureCookies: boolean;
  sessionTtlSeconds: number; challengeTtlSeconds: number; pairingTtlSeconds: number;
  stepUpTtlSeconds: number; maxCredentials: number; recoveryCodeCount: number;
}>;

export class CustomerAuthConfigurationError extends Error {
  constructor() { super("顧客認証の設定を確認してください。"); }
}

function positiveInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new CustomerAuthConfigurationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new CustomerAuthConfigurationError();
  return parsed;
}

/** Development defaults are provisional. Production requires explicit approval AND exact HTTPS origin/RP configuration. */
export function getCustomerAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env): CustomerAuthConfig | null {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (env.CUSTOMER_AUTH_ENABLED === "false") return null;
  if (production && (env.CUSTOMER_AUTH_ENABLED !== "true" || env.CUSTOMER_AUTH_PRODUCTION_APPROVED !== "true")) return null;
  if (production && (!env.CUSTOMER_AUTH_ORIGIN || !env.CUSTOMER_AUTH_RP_ID)) throw new CustomerAuthConfigurationError();
  const rawOrigin = env.CUSTOMER_AUTH_ORIGIN ?? "http://localhost:3000";
  let origin: URL;
  try { origin = new URL(rawOrigin); } catch { throw new CustomerAuthConfigurationError(); }
  const rpId = env.CUSTOMER_AUTH_RP_ID ?? "localhost";
  // Restrict to the exact hostname; shared-parent RP IDs are not part of this development configuration.
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
    || origin.hostname !== rpId || !/^(localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(rpId)
    || /^\d+(?:\.\d+){3}$/.test(rpId) || rpId.includes("..")
    || (origin.protocol !== "https:" && !(origin.protocol === "http:" && rpId === "localhost" && !production))) throw new CustomerAuthConfigurationError();
  return Object.freeze({
    origin: origin.origin, rpId, rpName: "麻雀ウェーブ", secureCookies: origin.protocol === "https:",
    sessionTtlSeconds: positiveInteger(env.CUSTOMER_AUTH_SESSION_TTL_SECONDS, 7 * 24 * 60 * 60, 300, 30 * 24 * 60 * 60),
    challengeTtlSeconds: positiveInteger(env.CUSTOMER_AUTH_CHALLENGE_TTL_SECONDS, 300, 30, 600),
    pairingTtlSeconds: positiveInteger(env.CUSTOMER_AUTH_PAIRING_TTL_SECONDS, 300, 30, 600),
    stepUpTtlSeconds: positiveInteger(env.CUSTOMER_AUTH_STEP_UP_TTL_SECONDS, 300, 30, 600),
    maxCredentials: positiveInteger(env.CUSTOMER_AUTH_MAX_CREDENTIALS, 5, 1, 20),
    recoveryCodeCount: positiveInteger(env.CUSTOMER_AUTH_RECOVERY_CODE_COUNT, 8, 1, 20),
  });
}
