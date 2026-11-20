import { ReceptionBadge } from "@/features/qr-reception/reception-badge";
import { pendingReceptionCount } from "@/features/qr-reception/queries";
import { qrReceptionEnabled } from "@/features/qr-reception/policy";
import type { ReactNode } from "react";
import { SessionActivity } from "@/components/layout/session-activity";
import { STAFF_SESSION_POLICY } from "@/lib/auth/session-policy";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireStaff } from "@/lib/auth/current-staff";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const roleLabel = { OWNER: "オーナー", MANAGER: "マネージャー", STAFF: "スタッフ" }[staff.role];
  const day = prisma ? await prisma.businessDay.findFirst({ where: { storeId: staff.storeId, closedAt: null }, select: { label: true } }) : null;

  const receptionCount = qrReceptionEnabled() && prisma ? await pendingReceptionCount(prisma, staff.storeId) : null;

  return <div className="app-shell"><Sidebar storeName={staff.storeName} staffName={staff.name} role={roleLabel} canManageStaff={staff.role === "OWNER" || staff.role === "MANAGER"} /><main className="main-content"><SessionActivity idleExpiresAt={staff.sessionLastActiveAt + STAFF_SESSION_POLICY.idleMs} expiresAt={staff.sessionIssuedAt + STAFF_SESSION_POLICY.absoluteMs} /><Topbar isBusinessOpen={Boolean(day)} receptionNotice={receptionCount !== null ? <ReceptionBadge key={`${staff.storeId}-${receptionCount}`} initialCount={receptionCount} /> : undefined} /><div className={`business-status-strip${day ? "" : " is-closed"}`}><span>{day ? `営業中 · ${day.label}開始` : "営業していません。受付前に営業を開始してください。"}</span><Link href="/admin/business-days" prefetch={false}>{day ? "営業状況・終了へ" : "営業開始へ"}</Link></div>{children}</main></div>;
}
