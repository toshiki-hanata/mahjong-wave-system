import { describe, expect, it } from "vitest";
import { QR_RECEPTION_POLICY, stationKey, validStationKey, createReceptionToken, validReceptionToken, receiptHash, receptionNameSchema, reviewSchema, qrReceptionEnabled, receptionOrigin, receptionRateKey } from "./policy";
const secret = "qr-test-secret-".repeat(4), at = new Date("2026-11-20T10:00:00Z"), store = "fixture-store", key = stationKey(store, 1, secret);
describe("QR reception credentials and boundaries", () => {
  it("requires an explicit feature switch without enabling customer identity features", () => { expect(qrReceptionEnabled({})).toBe(false); expect(qrReceptionEnabled({ QR_RECEPTION_ENABLED: "true" })).toBe(true); });
  it("binds the common QR to its store, revision, purpose and environment secret", () => {
    expect(validStationKey(store, 1, key, secret)).toBe(true);
    for (const [s, revision, k, password] of [["other", 1, key, secret], [store, 2, key, secret], [store, 1, key, "other".repeat(12)], [store, 1, key + "x", secret]] as const) expect(validStationKey(s, revision, k, password)).toBe(false);
  });
  it("rejects malformed keys without unsafe timing comparisons", () => { for (const bad of ["", "1", "1.z", "1.00", key + ".", "1." + "a".repeat(64) + ".x", "x".repeat(300)]) expect(validStationKey(store, 1, bad, secret)).toBe(false); });
  it("accepts only a signed form token for the same QR and store", () => {
    const token = createReceptionToken(store, key, secret, at);
    expect(validReceptionToken(store, key, token, secret, undefined, at)).toBe(true);
    expect(validReceptionToken("other", key, token, secret, undefined, at)).toBe(false);
    expect(validReceptionToken(store, stationKey(store, 2, secret), token, secret, undefined, at)).toBe(false);
    expect(validReceptionToken(store, key, token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), secret, undefined, at)).toBe(false);
    expect(validReceptionToken(store, key, key, secret, undefined, at)).toBe(false);
  });
  it("expires form submissions and rejects future-dated credentials", () => {
    const token = createReceptionToken(store, key, secret, at);
    expect(validReceptionToken(store, key, token, secret, undefined, new Date(at.getTime() + QR_RECEPTION_POLICY.formMs + 1))).toBe(false);
    expect(validReceptionToken(store, key, token, secret, undefined, new Date(at.getTime() - 31_000))).toBe(false);
    expect(validReceptionToken(store, key, token, secret, QR_RECEPTION_POLICY.receiptSeconds * 1000, new Date(at.getTime() + 3600_000))).toBe(true);
  });
  it("uses random receipt secrets and stores only a hash", () => { const a = createReceptionToken(store, key, secret, at), b = createReceptionToken(store, key, secret, at); expect(a).not.toBe(b); expect(receiptHash(a)).toMatch(/^[a-f0-9]{64}$/); expect(receiptHash(a)).not.toContain(a); });
  it("normalizes names while limiting size and refusing control characters", () => { expect(receptionNameSchema.parse("　山田   花子　")).toBe("山田 花子"); for (const invalid of [" ", "x".repeat(121), "name\u0000"]) expect(receptionNameSchema.safeParse(invalid).success).toBe(false); });
  it("requires an explicit staff confirmation before review", () => { expect(reviewSchema.safeParse({ requestId: "r", mode: "existing", customerId: "c", newName: "", personConfirmed: false, differentPersonConfirmed: false }).success).toBe(false); });
  it("keeps reception limits separate from names, login IDs and raw network addresses", () => { const hash = receptionRateKey(store, "192.0.2.5", secret); expect(hash).toMatch(/^[a-f0-9]{64}$/); expect(hash).not.toContain("192.0.2.5"); expect(hash).not.toBe(receptionRateKey("other", "192.0.2.5", secret)); });
  it("allows only an exact HTTPS hosted origin or local development", () => { expect(receptionOrigin({ APP_ORIGIN: "https://wave.example" })).toBe("https://wave.example"); for (const bad of ["https://wave.example/", "https://wave.example/path", "https://user:pass@wave.example", "http://wave.example"]) expect(() => receptionOrigin({ APP_ORIGIN: bad, VERCEL_ENV: "preview" })).toThrow(); });
});
