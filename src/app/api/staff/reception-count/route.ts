import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { reserveStaffAction } from "@/lib/auth/staff-action-quota";
import { prisma } from "@/lib/prisma";
import { isSameOriginMutation } from "@/lib/security/mutation-origin";
import { logSecurityEvent } from "@/lib/security/security-log";
import { qrReceptionEnabled } from "@/features/qr-reception/policy";
import { pendingReceptionCount } from "@/features/qr-reception/queries";
export const dynamic = "force-dynamic";
const reply = (data: { count?: number; enabled?: boolean }, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" } });
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameOriginMutation(origin, request.nextUrl.origin, process.env.APP_ORIGIN)) return reply({}, 403);
  try {
    const staff = await getCurrentStaff();
    if (!staff) return reply({}, 401);
    if (!qrReceptionEnabled()) return reply({ count: 0, enabled: false });
    if (!prisma) return reply({}, 503);
    if (!await reserveStaffAction(prisma, staff)) return reply({}, 429);
    return reply({ count: await pendingReceptionCount(prisma, staff.storeId), enabled: true });
  } catch { logSecurityEvent("REQUEST_ERROR", "error"); return reply({}, 503); }
}
