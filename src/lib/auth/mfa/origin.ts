import "server-only";
import { headers } from "next/headers";
import { isSameOriginMutation } from "@/lib/security/mutation-origin";
export async function requireMfaOrigin(): Promise<void> {
  const request = await headers(), origin = request.get("origin"), host = request.get("host");
  let valid = false;
  try { valid = Boolean(host) && isSameOriginMutation(origin, new URL(origin ?? "").protocol + "//" + host, process.env.APP_ORIGIN || undefined); } catch { /* Invalid/missing origins are rejected. */ }
  if (!valid) throw new Error("操作元を確認できません。ログイン画面からやり直してください。");
}
