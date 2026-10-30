import "server-only";
import { cookies, headers } from "next/headers";
import { getCustomerAuthConfig } from "./auth-config";
import { isAuthToken } from "./auth-tokens";
import { CustomerLinkError } from "./pairing-service";

const cookieName = "mahjong_link_claim";
export async function readPairingClaim(): Promise<string | undefined> {
  const value = (await cookies()).get(cookieName)?.value;
  return isAuthToken(value) ? value : undefined;
}
export async function writePairingClaim(value: string) {
  const config = getCustomerAuthConfig();
  if (!config || !isAuthToken(value)) throw new CustomerLinkError();
  (await cookies()).set(cookieName, value, { httpOnly: true, secure: config.secureCookies, sameSite: "strict", path: "/member", maxAge: config.pairingTtlSeconds });
}
export async function requireCustomerOrigin() {
  const config = getCustomerAuthConfig();
  if (!config || (await headers()).get("origin") !== config.origin) throw new CustomerLinkError();
}
