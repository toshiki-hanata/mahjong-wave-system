export function buildContentSecurityPolicy(nonce: string, environment: "development" | "production"): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${environment === "development" ? " 'unsafe-eval'" : ""}`,
    // Existing dashboard uses a CSS width style attribute for its progress bar.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${environment === "development" ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(environment === "production" ? ["upgrade-insecure-requests"] : []),
  ];
  return `${directives.join("; ")};`;
}

export function securityResponseHeaders(environment: "development" | "production"): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
    ...(environment === "production" ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}
