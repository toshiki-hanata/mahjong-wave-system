import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireStaff } from "@/lib/auth/current-staff";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const roleLabel = { OWNER: "オーナー", MANAGER: "マネージャー", STAFF: "スタッフ" }[staff.role];

  return <div className="app-shell"><Sidebar storeName={staff.storeName} staffName={staff.name} role={roleLabel} canManageStaff={staff.role === "OWNER" || staff.role === "MANAGER"} /><main className="main-content"><Topbar />{children}</main></div>;
}
