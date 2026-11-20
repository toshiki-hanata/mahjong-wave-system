import type { Role } from "@prisma/client";
export const MFA_POLICY = Object.freeze({ challengeMs: 5 * 60000, failureWindowMs: 5 * 60000, maximumFailures: 5, maximumPending: 3 });
export function requiresStaffMfa(role: Role): boolean { return role === "OWNER" || role === "MANAGER"; }
export function hasMfaStamp(session: { issuedAt?: number; mfaVerifiedAt?: number; mfaVersion?: number }): boolean {
  return Boolean(Number.isSafeInteger(session.issuedAt) && Number.isSafeInteger(session.mfaVersion) && session.mfaVersion! >= 0
    && Number.isSafeInteger(session.mfaVerifiedAt) && session.mfaVerifiedAt! > 0 && session.mfaVerifiedAt! <= session.issuedAt! + 30000
    && session.issuedAt! - session.mfaVerifiedAt! <= MFA_POLICY.challengeMs + 30000);
}
export function hasMfaProof(session: { issuedAt?: number; mfaVerifiedAt?: number; mfaVersion?: number }, profile: { enabledAt: Date | null; secretCiphertext: string | null; version: number } | null): boolean {
  return Boolean(profile?.enabledAt && profile.secretCiphertext && hasMfaStamp(session) && session.mfaVersion === profile.version);
}
