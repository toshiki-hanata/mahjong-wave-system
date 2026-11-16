/** Exact origins only. Forwarded headers and allowlist wildcards are deliberately not consulted. */
export function isSameOriginMutation(origin: string | null, requestOrigin: string, expectedOrigin?: string): boolean {
  if (!origin || origin === "null") return false;
  try {
    const supplied = new URL(origin);
    const expected = new URL(expectedOrigin ?? requestOrigin);
    return ["https:", "http:"].includes(supplied.protocol)
      && origin === supplied.origin && supplied.origin === expected.origin
      && !expected.username && !expected.password && expected.pathname === "/"
      && !expected.search && !expected.hash;
  } catch { return false; }
}
