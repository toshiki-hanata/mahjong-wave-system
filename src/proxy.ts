import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { shouldRedirectToLogin } from "@/lib/auth/proxy-rules";
import { buildContentSecurityPolicy, securityResponseHeaders } from "@/lib/security/headers";

export function proxy(request: NextRequest) {
  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  const nonce = Buffer.from(randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce, environment);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const hasSessionCookie = request.cookies.has("mahjong_admin");
  const response = shouldRedirectToLogin(request.nextUrl.pathname, hasSessionCookie)
    ? NextResponse.redirect(new URL("/admin/login", request.url))
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(securityResponseHeaders(environment))) response.headers.set(name, value);
  if (process.env.VERCEL === "1") response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
