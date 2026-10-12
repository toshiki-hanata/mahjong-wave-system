import { dashboardDemoData } from "./demo-data";
import type { DashboardData } from "./types";

/** Data access boundary. DB-backed implementation belongs with Sprint 1+ models. */
export async function getDashboardData(): Promise<DashboardData> {
  return dashboardDemoData;
}
