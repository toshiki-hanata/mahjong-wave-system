import "server-only";

export type SecurityEvent = "MFA_ERROR" | "LOGIN_FAILED" | "LOGIN_THROTTLED" | "LOGIN_ERROR" | "LOGIN_SUCCESS"
  | "SESSION_REJECTED" | "AUTHORIZATION_DENIED" | "LOGOUT_REVOKED" | "LOGOUT_ERROR"
  | "SESSION_REFRESH_ERROR" | "ACTION_THROTTLED" | "ACTION_GUARD_ERROR" | "REQUEST_ERROR";

/** Deliberately accepts no request body, URL, identifier, exception or credential. */
export function logSecurityEvent(event: SecurityEvent, severity: "info" | "warn" | "error" = "warn"): void {
  const entry = JSON.stringify({ category: "security", event, at: new Date().toISOString() });
  if (severity === "error") console.error(entry);
  else if (severity === "info") console.info(entry);
  else console.warn(entry);
}
