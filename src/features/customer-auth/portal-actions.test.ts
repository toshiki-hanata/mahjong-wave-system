import { describe, expect, it, vi, afterEach } from "vitest";
const guards = vi.hoisted(() => ({ mutate: vi.fn(), cookie: vi.fn() }));
vi.mock("./portal-http", () => ({ memberMutation: guards.mutate, memberCookie: guards.cookie, challengeCookie: guards.cookie, setMemberCookie: vi.fn(), clearMemberCookie: vi.fn(), MEMBER_COOKIE: "member", CHALLENGE_COOKIE: "challenge" }));
vi.mock("./pairing-cookie", () => ({ readPairingClaim: vi.fn() }));
import { memberLoginOptionsAction, memberLoginVerifyAction, memberRegistrationOptionsAction, memberRegistrationVerifyAction, memberRecoveryRotateAction, memberRecoveryAcknowledgeAction, memberPasskeyRemoveAction, memberLogoutAction } from "@/app/member/auth/actions";
afterEach(() => vi.resetAllMocks());
describe("customer Server Actions fail closed before data access", () => {
  it("returns fixed errors for every absent or cross-origin/disabled request without reading identity cookies", async () => {
    guards.mutate.mockRejectedValue(new Error("private-token private-database-url"));
    const results = await Promise.all([memberLoginOptionsAction(), memberLoginVerifyAction({}), memberRegistrationOptionsAction("ENROLL"), memberRegistrationVerifyAction({}, "端末"), memberRecoveryRotateAction(), memberRecoveryAcknowledgeAction(1), memberPasskeyRemoveAction("another-account-key"), memberLogoutAction()]);
    for (const r of results) { expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toContain("private-"); }
    expect(guards.cookie).not.toHaveBeenCalled();
  });
});
