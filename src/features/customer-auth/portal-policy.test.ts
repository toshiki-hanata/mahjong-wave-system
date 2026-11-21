import { describe, expect, it } from "vitest";
import { createPortalToken, hashPortalValue, newRecoveryCode, normalizedRecoveryCode, sameUserHandle, validWebAuthnEnvelope } from "./portal-policy";
const secret = "isolated-portal-policy-secret-".repeat(3);
describe("member credential boundaries", () => {
  it("keeps token purposes and stores separate with random opaque tokens", () => { const a = createPortalToken(), b = createPortalToken(); expect(a).not.toBe(b); expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(hashPortalValue("session", a, secret)).not.toBe(hashPortalValue("challenge", a, secret)); expect(hashPortalValue("session", a, secret)).not.toContain(a); });
  it("requires a proper secret without logging it", () => { expect(() => hashPortalValue("session", "value", "short")).toThrow(); });
  it("normalizes only a full high-entropy recovery code", () => { const code = newRecoveryCode(); expect(code).toMatch(/^(?:[A-F0-9]{8}-){4}[A-F0-9]{8}$/); expect(normalizedRecoveryCode(code)).toBe(code.replaceAll("-", "").toLowerCase()); expect(normalizedRecoveryCode("123456")).toBeNull(); expect(normalizedRecoveryCode("x".repeat(90))).toBeNull(); });
  it("requires the credential's exact server-owned user handle", () => { const id = "fixture-identity"; expect(sameUserHandle(Buffer.from(id).toString("base64url"), id)).toBe(true); expect(sameUserHandle(Buffer.from("another").toString("base64url"), id)).toBe(false); expect(sameUserHandle(null, id)).toBe(false); });
  it("bounds WebAuthn payloads before library verification", () => { expect(validWebAuthnEnvelope({}, true)).toBe(false); expect(validWebAuthnEnvelope({ id: "abc", rawId: "other", type: "public-key", response: { clientDataJSON: "YWJj", attestationObject: "YWJj" } }, true)).toBe(false); expect(validWebAuthnEnvelope({ id: "YWJj", rawId: "YWJj", type: "public-key", response: { clientDataJSON: "YWJj", attestationObject: "YWJj" }, padding: "x".repeat(65536) }, true)).toBe(false); });
});
