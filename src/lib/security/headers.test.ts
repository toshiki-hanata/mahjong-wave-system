import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityResponseHeaders } from "./headers";

describe("HTTP security headers", () => {
  it("creates a nonce-based policy without production unsafe-eval", () => {
    const csp = buildContentSecurityPolicy("nonce-token", "production");
    expect(csp).toContain("script-src 'self' 'nonce-nonce-token' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("adds development eval only for Next.js development tooling and production HSTS only in production", () => {
    expect(buildContentSecurityPolicy("n", "development")).toContain("unsafe-eval");
    expect(securityResponseHeaders("development")["Strict-Transport-Security"]).toBeUndefined();
    expect(securityResponseHeaders("production")["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(securityResponseHeaders("production")).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Frame-Options": "DENY",
    });
  });
});
