import { describe, expect, it } from "vitest";
import { getCustomerAuthConfig, CustomerAuthConfigurationError } from "./auth-config";

describe("Customer authentication deployment guard", () => {
  it("supplies explicitly provisional localhost defaults without staff session changes", () => {
    expect(getCustomerAuthConfig({ NODE_ENV: "development" })).toMatchObject({ origin: "http://localhost:3000", rpId: "localhost", secureCookies: false, sessionTtlSeconds: 604800, pairingTtlSeconds: 300, maxCredentials: 5, recoveryCodeCount: 8 });
  });
  it.each([
    { NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production", CUSTOMER_AUTH_ENABLED: "true" },
    { NODE_ENV: "production", CUSTOMER_AUTH_PRODUCTION_APPROVED: "true" }, { NODE_ENV: "production", CUSTOMER_AUTH_ENABLED: "true" },
    { NODE_ENV: "development", CUSTOMER_AUTH_ENABLED: "false" },
  ])("keeps production or disabled customer authentication closed %#", (env) => { expect(getCustomerAuthConfig(env)).toBeNull(); });
  it("requires explicit HTTPS configuration even after both production flags are set", () => {
    const base = { NODE_ENV: "production", CUSTOMER_AUTH_ENABLED: "true", CUSTOMER_AUTH_PRODUCTION_APPROVED: "true" };
    expect(() => getCustomerAuthConfig(base)).toThrow(CustomerAuthConfigurationError);
    expect(() => getCustomerAuthConfig({ ...base, CUSTOMER_AUTH_ORIGIN: "http://localhost:3000", CUSTOMER_AUTH_RP_ID: "localhost" })).toThrow(CustomerAuthConfigurationError);
    expect(getCustomerAuthConfig({ ...base, CUSTOMER_AUTH_ORIGIN: "https://members.example.com", CUSTOMER_AUTH_RP_ID: "members.example.com" })?.secureCookies).toBe(true);
  });
  it.each([
    ["http://192.168.1.10:3000", "192.168.1.10"], ["https://192.168.1.10", "192.168.1.10"],
    ["http://members.example.com", "members.example.com"], ["https://members.example.com", "example.com"],
    ["https://members.example.com/path", "members.example.com"], ["https://members.example.com?q=secret", "members.example.com"],
    ["https://user:password@members.example.com", "members.example.com"], ["https://members.example.com#fragment", "members.example.com"],
    ["javascript:alert(1)", "localhost"], ["https://a..example.com", "a..example.com"],
  ])("rejects unsafe or mismatched origin configuration %#", (origin, rpId) => {
    expect(() => getCustomerAuthConfig({ NODE_ENV: "development", CUSTOMER_AUTH_ORIGIN: origin, CUSTOMER_AUTH_RP_ID: rpId })).toThrow(CustomerAuthConfigurationError);
  });
  it.each(["0", "-1", "300.1", "Infinity", "invalid", "9999999999999999999999"])("rejects invalid session limits %#", (value) => {
    expect(() => getCustomerAuthConfig({ CUSTOMER_AUTH_SESSION_TTL_SECONDS: value })).toThrow(CustomerAuthConfigurationError);
  });
  it("allows bounded temporary settings and makes them immutable", () => {
    const config = getCustomerAuthConfig({ CUSTOMER_AUTH_SESSION_TTL_SECONDS: "3600", CUSTOMER_AUTH_MAX_CREDENTIALS: "3" });
    expect(config?.sessionTtlSeconds).toBe(3600); expect(config?.maxCredentials).toBe(3); expect(Object.isFrozen(config)).toBe(true);
  });
});
