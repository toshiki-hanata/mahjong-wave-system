import { Dashboard } from "@/features/dashboard/dashboard";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";
import { getTableDashboardCounts } from "@/features/tables/table-queries";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  const [data, tableCounts] = await Promise.all([
    getDashboardData(),
    getTableDashboardCounts(prisma, staff.storeId),
  ]);
  return <Dashboard data={data} staffName={staff.name} tableCounts={tableCounts} />;
}
