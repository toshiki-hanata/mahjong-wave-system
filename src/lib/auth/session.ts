import "server-only";

import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { AdminSessionData } from "./session-data";
import { parseAdminSession } from "./session-data";
import { isStaffSessionFresh, STAFF_SESSION_POLICY } from "./session-policy";

function getSessionOptions(): SessionOptions | null {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) return null;

  return {
    password,
    cookieName: "mahjong_admin",
    ttl: STAFF_SESSION_POLICY.absoluteMs / 1000,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function readAdminSession(): Promise<IronSession<AdminSessionData> | null> {
  const options = getSessionOptions();
  if (!options) return null;
  return getIronSession<AdminSessionData>(await cookies(), options);
}

export async function writeAdminSession(data: Required<Pick<AdminSessionData, "staffId" | "storeId" | "role" | "sessionVersion">>): Promise<void> {
  const options = getSessionOptions();
  if (!options) throw new Error("SESSION_SECRET must be configured with at least 32 characters.");

  const session = await getIronSession<AdminSessionData>(await cookies(), options);
  // iron-session v9 forbids saving a session after destroy(); this object is
  // already authenticated and encrypted, so overwrite its known auth fields.
  delete session.staffId;
  delete session.storeId;
  delete session.role;
  delete session.sessionVersion;
  session.staffId = data.staffId;
  session.storeId = data.storeId;
  session.role = data.role;
  session.sessionVersion = data.sessionVersion;
  session.issuedAt = Date.now();
  session.lastActiveAt = session.issuedAt;
  await session.save();
}

export async function destroyAdminSession(): Promise<void> {
  const session = await readAdminSession();
  await session?.destroy();
}

/** Called only from a Server Action after the current Staff and cookie version were checked. */
export async function touchAdminSession(staff: { id: string; storeId: string; sessionVersion: number }) {
  const session = await readAdminSession();
  const parsed = session && parseAdminSession(session);
  if (!session || !parsed?.success || !isStaffSessionFresh(parsed.data)
    || parsed.data.staffId !== staff.id || parsed.data.storeId !== staff.storeId
    || parsed.data.sessionVersion !== staff.sessionVersion) return null;
  if (Date.now() - parsed.data.lastActiveAt >= STAFF_SESSION_POLICY.refreshIntervalMs) {
    session.lastActiveAt = Date.now();
    await session.save();
  }
  return { issuedAt: parsed.data.issuedAt, lastActiveAt: session.lastActiveAt! };
}
