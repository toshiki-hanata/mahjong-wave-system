import { describe, expect, it } from "vitest";
import { isStaffSessionFresh, STAFF_SESSION_POLICY as policy } from "./session-policy";
const now = Date.UTC(2026, 10, 16, 3);
describe("approved staff session limits", () => {
  it("accepts current activity and rejects cookies missing the new timestamps", () => {
    expect(isStaffSessionFresh({ issuedAt: now - 60000, lastActiveAt: now }, now)).toBe(true);
    expect(isStaffSessionFresh({}, now)).toBe(false);
  });
  it("expires exactly at 30 idle minutes and eight absolute hours", () => {
    expect(isStaffSessionFresh({ issuedAt: now - policy.idleMs, lastActiveAt: now - policy.idleMs }, now)).toBe(false);
    expect(isStaffSessionFresh({ issuedAt: now - policy.idleMs + 1, lastActiveAt: now - policy.idleMs + 1 }, now)).toBe(true);
    expect(isStaffSessionFresh({ issuedAt: now - policy.absoluteMs, lastActiveAt: now }, now)).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0, 1.1, Number.MAX_SAFE_INTEGER + 1])("rejects malformed timestamp %s", value => {
    expect(isStaffSessionFresh({ issuedAt: value, lastActiveAt: now }, now)).toBe(false);
    expect(isStaffSessionFresh({ issuedAt: now, lastActiveAt: value }, now)).toBe(false);
  });
  it("rejects activity predating authentication and excessive future timestamps", () => {
    expect(isStaffSessionFresh({ issuedAt: now, lastActiveAt: now - 1 }, now)).toBe(false);
    expect(isStaffSessionFresh({ issuedAt: now + policy.clockSkewMs + 1, lastActiveAt: now + policy.clockSkewMs + 1 }, now)).toBe(false);
  });
});
