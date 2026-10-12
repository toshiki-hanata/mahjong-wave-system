import type { DashboardData } from "./types";

/** Synthetic presentation data only. Replace this provider with a DB query after Sprint 1. */
export const dashboardDemoData: DashboardData = {
  source: "demo",
  metrics: {
    revenueYen: 48_600,
    revenueChangePercent: 12.8,
    visitors: 24,
    visitorChangeCount: 3,
    hanchanCount: 18,
    hanchanTargetCount: 24,
    activeTables: 3,
    totalTables: 5,
  },
  tables: [
    { id: "table-1", name: "1番卓", mode: "東南戦", players: ["佐", "鈴", "高", "山"], round: "東 3局", startedAt: "13:24", status: "busy" },
    { id: "table-2", name: "2番卓", mode: "東南戦", players: ["伊", "小", "中", "松"], round: "南 1局", startedAt: "14:06", status: "busy" },
    { id: "table-3", name: "3番卓", mode: "東南戦", players: ["渡", "吉", "井", "木"], round: "東 4局", startedAt: "14:32", status: "busy" },
    { id: "table-4", name: "4番卓", mode: "東南戦", players: [], round: "待機中", startedAt: null, status: "idle" },
  ],
  weeklyRevenue: {
    totalYen: 286_400,
    previousWeekChangePercent: 8.2,
    gameYen: 198_000,
    foodYen: 72_400,
    otherYen: 16_000,
    current: [39, 46, 42, 59, 52, 68, 64],
    previous: [31, 37, 34, 41, 38, 49, 55],
  },
  recentGames: [
    { id: "game-1", customerName: "佐藤 健一", tableName: "1番卓", mode: "東南戦", rank: 1, score: 42.6, time: "15:18" },
    { id: "game-2", customerName: "鈴木 みさき", tableName: "1番卓", mode: "東南戦", rank: 2, score: 8.4, time: "15:18" },
    { id: "game-3", customerName: "高橋 大輔", tableName: "1番卓", mode: "東南戦", rank: 3, score: -16.2, time: "15:18" },
  ],
};
