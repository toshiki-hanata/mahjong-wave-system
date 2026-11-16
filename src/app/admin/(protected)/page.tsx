import { OperationalDashboard } from "@/features/dashboard/operational-dashboard";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const staff = await requireStaff();
  const data = await getDashboardData(prisma, staff.storeId);
  return <>{error === "action-rate-limited" && <p className="business-warning" role="alert">操作が続いているため停止しました。1分ほど待ち、最新の記録を確認してください。</p>}{error === "invalid-origin" && <p className="business-warning" role="alert">操作元を確認できません。正しいアドレスから画面を開き直してください。</p>}<OperationalDashboard data={data} staffName={staff.name} timezone={staff.storeTimezone} /></>;
}
