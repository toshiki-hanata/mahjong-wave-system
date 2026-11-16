import { describe, expect, it } from "vitest";
import { assertPilotReleaseReady } from "./release-readiness";
describe("user-approved management-MFA release gate", () => {
  it("cannot be bypassed in production by the former customer approval flags", () => {
    expect(() => assertPilotReleaseReady({ VERCEL_ENV: "production", CUSTOMER_AUTH_PRODUCTION_APPROVED: "true", STAFF_MFA_RELEASE_APPROVED: "true" })).toThrow("管理者MFA");
  });
  it("preserves local verification and does not pretend an isolated build is an approved deployment", () => {
    expect(() => assertPilotReleaseReady({ NODE_ENV: "production" })).not.toThrow();
    expect(() => assertPilotReleaseReady({ VERCEL_ENV: "preview" })).not.toThrow();
  });
});
