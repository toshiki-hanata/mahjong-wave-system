import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { logSecurityEvent } from "@/lib/security/security-log";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";
import { prisma } from "@/lib/prisma";
import { MemberAuthError, getPortalConfig, portalConfig } from "./portal-config";
import { portalTokenSchema } from "./portal-policy";
import { readMemberSession } from "./portal-session";
import { reserveMemberAttempt } from "./portal-service";
export const MEMBER_COOKIE = "wave_member_session", CHALLENGE_COOKIE = "wave_member_challenge";
export async function memberCookie() { return (await cookies()).get(MEMBER_COOKIE)?.value; }
export async function challengeCookie() { return (await cookies()).get(CHALLENGE_COOKIE)?.value; }
export async function setMemberCookie(name: typeof MEMBER_COOKIE | typeof CHALLENGE_COOKIE, value: string, expires: Date) {
  const config = portalConfig(); if (!portalTokenSchema.safeParse(value).success) throw new MemberAuthError();
  (await cookies()).set(name, value, { httpOnly: true, secure: config.secureCookies, sameSite: "lax", path: "/member", expires });
}
export async function clearMemberCookie(name: typeof MEMBER_COOKIE | typeof CHALLENGE_COOKIE) {
  (await cookies()).set(name, "", { httpOnly: true, secure: portalConfig().secureCookies, sameSite: "lax", path: "/member", maxAge: 0 });
}
export async function memberMutation(rateLimited = true) {
  const config = portalConfig(), h = await headers();
  if (h.get("origin") !== config.origin || !prisma) throw new MemberAuthError();
  await assertRuntimeDatabaseRole(prisma);
  // Vercel overwrites x-vercel-forwarded-for; never trust arbitrary client supplied IP headers on hosted deployments.
  const address = process.env.VERCEL === "1" ? h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local-development";
  if (rateLimited && !await reserveMemberAttempt(prisma, address ?? "unknown")) { logSecurityEvent("MEMBER_AUTH_THROTTLED"); throw new MemberAuthError("操作が続いています。少し待ってからお試しください。"); }
  return prisma;
}
export async function requireMemberPage() {
  if (!getPortalConfig()) notFound();
  if (!prisma) throw new MemberAuthError();
  await assertRuntimeDatabaseRole(prisma);
  const subject = await readMemberSession(prisma, await memberCookie());
  if (!subject) redirect("/member/login"); return { database: prisma, subject };
}
