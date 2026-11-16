/** Customer identity features are unfinished and cannot be enabled in a hosted or production pilot. */
export function customerDevelopmentFeaturesAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.VERCEL !== "1" && !env.VERCEL_ENV;
}
