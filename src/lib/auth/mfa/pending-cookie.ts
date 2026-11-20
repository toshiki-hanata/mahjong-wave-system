import "server-only";
import { cookies } from "next/headers";
import { parseMfaChallengeToken } from "./crypto";
import { MFA_POLICY } from "./policy";
export const MFA_COOKIE_NAME = "mahjong_mfa_pending";
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1", sameSite: "lax" as const, path: "/admin" });
export async function readMfaPendingToken(): Promise<string | null> {
  const token = (await cookies()).get(MFA_COOKIE_NAME)?.value;
  return parseMfaChallengeToken(token) ? token! : null;
}
export async function writeMfaPendingToken(token: string): Promise<void> {
  if (!parseMfaChallengeToken(token)) throw new Error("追加認証を開始できません。");
  (await cookies()).set(MFA_COOKIE_NAME, token, { ...options(), maxAge: MFA_POLICY.challengeMs / 1000 });
}
export async function clearMfaPendingToken(): Promise<void> { (await cookies()).set(MFA_COOKIE_NAME, "", { ...options(), maxAge: 0 }); }
