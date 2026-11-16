import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameOriginMutation } from "./mutation-origin";
import { customerDevelopmentFeaturesAllowed } from "./pilot-release";
import { logSecurityEvent } from "./security-log";
import { onRequestError } from "@/instrumentation";
afterEach(() => vi.restoreAllMocks());
describe("request and pilot boundaries", () => {
  it.each([null, "null", "https://attacker.example", "https://app.example.attacker.example", "http://app.example", "https://app.example/", "https://app.example/path", "https://app.example https://attacker.example"])("rejects missing or cross-origin mutations: %s", origin => {
    expect(isSameOriginMutation(origin, "https://app.example")).toBe(false);
  });
  it("permits exact same-origin requests and uses configured production origin", () => {
    expect(isSameOriginMutation("https://app.example", "https://app.example")).toBe(true);
    expect(isSameOriginMutation("http://localhost:3000", "http://localhost:3000")).toBe(true);
    expect(isSameOriginMutation("https://attacker.example", "https://attacker.example", "https://app.example")).toBe(false);
  });
  it.each([{ NODE_ENV: "production" }, { VERCEL: "1" }, { NODE_ENV: "development", VERCEL_ENV: "preview" }, { VERCEL_ENV: "production", CUSTOMER_AUTH_ENABLED: "true", CUSTOMER_AUTH_PRODUCTION_APPROVED: "true" }])("blocks unfinished customer features in a hosted pilot %#", env => {
    expect(customerDevelopmentFeaturesAllowed(env)).toBe(false);
  });
  it("retains explicitly local development", () => expect(customerDevelopmentFeaturesAllowed({ NODE_ENV: "development" })).toBe(true));
  it("logs controlled event codes, never exception or request data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}), error = vi.spyOn(console, "error").mockImplementation(() => {});
    logSecurityEvent("LOGIN_FAILED");
    await onRequestError(new Error("secret-password fixture-person"), { path: "/?token=secret-token", method: "POST", headers: { cookie: "secret-cookie" } }, { routerKind: "App Router", routePath: "/admin/customers/[id]", routeType: "action", revalidateReason: undefined });
    expect(warn.mock.calls.flat().join()).toContain("LOGIN_FAILED");
    expect(error.mock.calls.flat().join()).toContain("REQUEST_ERROR");
    expect(error.mock.calls.flat().join()).not.toMatch(/secret|fixture-person|cookie|token/);
  });
});
