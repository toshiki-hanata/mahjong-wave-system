import "server-only";

import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { AdminSessionData } from "./session-data";

function getSessionOptions(): SessionOptions | null {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) return null;

  return {
    password,
    cookieName: "mahjong_admin",
    ttl: 60 * 60 * 8,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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

export async function writeAdminSession(data: Required<AdminSessionData>): Promise<void> {
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
  await session.save();
}

export async function destroyAdminSession(): Promise<void> {
  const session = await readAdminSession();
  await session?.destroy();
}
