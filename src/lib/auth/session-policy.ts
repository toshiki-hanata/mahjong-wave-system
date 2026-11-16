export const STAFF_SESSION_POLICY = Object.freeze({
  absoluteMs: 8 * 60 * 60 * 1000,
  idleMs: 30 * 60 * 1000,
  refreshIntervalMs: 60 * 1000,
  clockSkewMs: 30 * 1000,
});

export function isStaffSessionFresh(session: { issuedAt?: number; lastActiveAt?: number }, now = Date.now()): boolean {
  const { issuedAt, lastActiveAt } = session;
  return Number.isSafeInteger(issuedAt) && Number.isSafeInteger(lastActiveAt)
    && issuedAt! > 0 && lastActiveAt! >= issuedAt!
    && issuedAt! <= now + STAFF_SESSION_POLICY.clockSkewMs
    && lastActiveAt! <= now + STAFF_SESSION_POLICY.clockSkewMs
    && now - issuedAt! < STAFF_SESSION_POLICY.absoluteMs
    && now - lastActiveAt! < STAFF_SESSION_POLICY.idleMs;
}
