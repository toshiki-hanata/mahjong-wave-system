export function isProtectedAdminPath(pathname: string): boolean {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function shouldRedirectToLogin(pathname: string, hasSessionCookie: boolean): boolean {
  return isProtectedAdminPath(pathname) && !hasSessionCookie;
}
