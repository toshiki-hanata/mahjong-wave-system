import { OperationalDashboard } from "@/features/dashboard/operational-dashboard";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  const data = await getDashboardData(prisma, staff.storeId);
  return <OperationalDashboard data={data} staffName={staff.name} timezone={staff.storeTimezone} />;
}
