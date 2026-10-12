import Link from "next/link";
import { getStoreRankingData, RANKING_METRIC_LABELS } from "@/features/rankings/ranking-queries";
import { currentPeriodValue, getPreviousPeriodValue, type RankingPeriodKind } from "@/features/rankings/ranking-period";
import type { RankingMetricKey } from "@/features/rankings/ranking-metrics";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/current-staff";

export const dynamic = "force-dynamic";

const periods: RankingPeriodKind[] = ["month", "year", "all"];
const metrics: RankingMetricKey[] = ["scoreTotal", "averageRank", "topRate", "reachRate", "bustAvoidanceRate", "gamesPlayed", "maxWinStreak"];

function selected<T extends string>(candidate: string | undefined, values: readonly T[], fallback: T): T {
  return values.includes(candidate as T) ? candidate as T : fallback;
}

function scoreLabel(stats: { scoreTotal: string }) { return `${stats.scoreTotal} pt`; }

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ period?: string; value?: string; metric?: string }> }) {
  const [staff, params] = await Promise.all([requireStaff(), searchParams]);
  const period = selected(params.period, periods, "month");
  const metric = selected(params.metric, metrics, "scoreTotal");
  const validValue = period === "month"
    ? Boolean(params.value && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.value) && Number(params.value.slice(0, 4)) >= 1900 && Number(params.value.slice(0, 4)) <= 9998)
    : period === "year" ? Boolean(params.value && /^\d{4}$/.test(params.value) && Number(params.value) >= 1900 && Number(params.value) <= 9998) : false;
  const value = period === "all" ? undefined : validValue ? params.value : currentPeriodValue(period, staff.storeTimezone);
  const data = await getStoreRankingData(prisma, staff.storeId, staff.storeTimezone, period, value, metric);
  const qualified = data.rows.filter((row) => row.eligible);
  const unqualified = data.rows.filter((row) => !row.eligible && row.gamesPlayed > 0);
  const previous = period === "all" || !value ? undefined : getPreviousPeriodValue(period, value);
  const previousHref = previous ? `/admin/rankings?period=${period}&value=${previous}&metric=${metric}` : undefined;

  return <div className="page-content rankings-page">
    <header className="rankings-heading"><div><p className="eyebrow">STORE PERFORMANCE</p><h1>店内ランキング</h1><p className="welcome-subtitle">{data.bounds?.label ?? "通算"} · 店舗 timezone: {staff.storeTimezone}</p></div><Link className="button button-secondary" href="/admin/rankings/settings">規定打数設定</Link></header>
    <form className="panel ranking-filter" action="/admin/rankings" method="get">
      <label>期間<select name="period" defaultValue={period}><option value="month">月間</option><option value="year">年間</option><option value="all">通算</option></select></label>
      {period === "month" && <label>対象月<input type="month" name="value" defaultValue={value} /></label>}
      {period === "year" && <label>対象年<input type="number" name="value" min={1900} max={9998} defaultValue={value} /></label>}
      <label>ランキング指標<select name="metric" defaultValue={metric}>{metrics.map((key) => <option key={key} value={key}>{RANKING_METRIC_LABELS[key]}</option>)}</select></label>
      <button className="button button-primary" type="submit">表示</button>
      {previousHref && <Link className="button button-secondary" href={previousHref}>前の期間</Link>}
    </form>

    <section className="panel ranking-board" aria-label="店舗内ランキング">
      <header className="ranking-board-heading"><div><h2>{RANKING_METRIC_LABELS[metric]}ランキング</h2><p>規定打数: {data.minimumGames}半荘 · 同値は同順位で表示します</p></div><span>{qualified.length}人</span></header>
      {qualified.length ? <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>順位</th><th>顧客</th><th>半荘数</th><th>score合計</th><th>平均順位</th><th>トップ率</th><th>連対率</th><th>ラス回避率</th><th>最大連勝</th></tr></thead><tbody>
        {qualified.map((row) => <tr key={row.customerId}><td data-label="順位"><strong className="ranking-place">{row.placement}</strong></td><td data-label="顧客"><Link href={`/admin/customers/${row.customerId}`}>{row.internalName}</Link></td><td data-label="半荘数">{row.stats.gamesPlayed}</td><td data-label="score合計">{scoreLabel(row.stats)}</td><td data-label="平均順位">{row.stats.averageRank ?? "—"}</td><td data-label="トップ率">{row.stats.topRate ?? "—"}</td><td data-label="連対率">{row.stats.reachRate ?? "—"}</td><td data-label="ラス回避率">{row.stats.bustAvoidanceRate ?? "—"}</td><td data-label="最大連勝">{row.stats.maxWinStreak}</td></tr>)}
      </tbody></table></div> : <p className="ranking-empty">この期間に規定打数を満たした顧客はいません。</p>}
    </section>
    {unqualified.length > 0 && <section className="panel ranking-board ranking-unqualified"><header className="ranking-board-heading"><div><h2>規定打数未達</h2><p>成績は表示しますが、ランキング順位の対象外です。</p></div><span>{unqualified.length}人</span></header><div className="ranking-unqualified-list">{unqualified.map((row) => <Link key={row.customerId} href={`/admin/customers/${row.customerId}`}><strong>{row.internalName}</strong><span>{row.gamesPlayed} / {data.minimumGames}半荘</span><span>{scoreLabel(row.stats)}</span></Link>)}</div></section>}
    {!prisma && <p className="ranking-error" role="status">DATABASE_URLが未設定のため、データを読み込めません。</p>}
  </div>;
}
