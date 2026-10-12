export type DashboardData = {
  source: "demo" | "database";
  metrics: {
    revenueYen: number;
    revenueChangePercent: number;
    visitors: number;
    visitorChangeCount: number;
    hanchanCount: number;
    hanchanTargetCount: number;
    activeTables: number;
    totalTables: number;
  };
  tables: Array<{
    id: string;
    name: string;
    mode: string;
    players: string[];
    round: string;
    startedAt: string | null;
    status: "busy" | "idle";
  }>;
  weeklyRevenue: {
    totalYen: number;
    previousWeekChangePercent: number;
    gameYen: number;
    foodYen: number;
    otherYen: number;
    current: number[];
    previous: number[];
  };
  recentGames: Array<{
    id: string;
    customerName: string;
    tableName: string;
    mode: string;
    rank: number;
    score: number;
    time: string;
  }>;
};
