import "server-only";
import { getCustomerAuthConfig, type CustomerAuthConfig } from "./auth-config";
export function getPortalConfig(env: Readonly<Record<string, string | undefined>> = process.env): CustomerAuthConfig | null {
  return env.CUSTOMER_PORTAL_ENABLED === "true" ? getCustomerAuthConfig(env) : null;
}
export class MemberAuthError extends Error { constructor(message = "本人確認を完了できませんでした。もう一度お試しいただくか、店員にお声がけください。") { super(message); } }
export function portalConfig(): CustomerAuthConfig { const config = getPortalConfig(); if (!config) throw new MemberAuthError(); return config; }
