import { describe, expect, it } from "vitest";
import { getPortalConfig } from "./portal-config";
const preview = { NODE_ENV: "production", VERCEL_ENV: "preview", CUSTOMER_PORTAL_ENABLED: "true", CUSTOMER_PORTAL_PREVIEW_ENABLED: "true", CUSTOMER_AUTH_ENABLED: "true", CUSTOMER_AUTH_ORIGIN: "https://trial.example.com", CUSTOMER_AUTH_RP_ID: "trial.example.com", APP_ORIGIN: "https://trial.example.com" };
describe("explicit customer portal deployment boundary", () => {
  it("does not query or expose a portal by default", () => { expect(getPortalConfig({ NODE_ENV: "development" })).toBeNull(); expect(getPortalConfig({ NODE_ENV: "production" })).toBeNull(); });
  it("permits only an explicitly enabled exact-origin HTTPS Preview", () => { expect(getPortalConfig(preview)).toMatchObject({ origin: preview.APP_ORIGIN, rpId: preview.CUSTOMER_AUTH_RP_ID, secureCookies: true }); });
  it.each(["CUSTOMER_PORTAL_ENABLED", "CUSTOMER_PORTAL_PREVIEW_ENABLED", "CUSTOMER_AUTH_ENABLED"])("blocks Preview without %s", flag => { expect(getPortalConfig({ ...preview, [flag]: undefined })).toBeNull(); });
  it("keeps true Production held even with all previous approval flags", () => { expect(getPortalConfig({ ...preview, VERCEL_ENV: "production", CUSTOMER_AUTH_PRODUCTION_APPROVED: "true" })).toBeNull(); });
  it("rejects a shared parent RP, another origin, and HTTP even on development-labelled Preview", () => { expect(() => getPortalConfig({ ...preview, CUSTOMER_AUTH_RP_ID: "example.com" })).toThrow(); expect(() => getPortalConfig({ ...preview, APP_ORIGIN: "https://another.example.com" })).toThrow(); expect(() => getPortalConfig({ ...preview, NODE_ENV: "development", APP_ORIGIN: "http://localhost:4188", CUSTOMER_AUTH_ORIGIN: "http://localhost:4188", CUSTOMER_AUTH_RP_ID: "localhost" })).toThrow(); });
});
