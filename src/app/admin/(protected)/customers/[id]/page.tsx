import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { CustomerForm } from "@/features/customers/customer-form";
import { DeactivateCustomerForm } from "@/features/customers/deactivate-customer-form";
import { getCustomerDetails } from "@/features/customers/customer-search";
import { getCustomerPerformance } from "@/features/rankings/ranking-queries";
import { scoreForDisplay } from "@/features/games/game-calculation";
import { updateCustomerAction } from "../actions";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

function dateLabel(date: Date | null, timezone: string) {
  return date ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: timezone }).format(date) : "未登録";
}

function PerformanceSection({ title, stats }: { title: string; stats: NonNullable<Awaited<ReturnType<typeof getCustomerPerformance>>>["allTime"] }) {
  return <section className="panel customer-info-panel performance-panel"><h2>{title}</h2><dl className="performance-grid">
    <div><dt>半荘数</dt><dd>{stats.gamesPlayed}</dd></div>
    <div><dt>順位回数</dt><dd>1着 {stats.firsts} ・2着 {stats.seconds} ・3着 {stats.thirds} ・4着 {stats.fourths}</dd></div>
    <div><dt>平均順位</dt><dd>{stats.averageRank ?? "—"}</dd></div>
    <div><dt>トップ率</dt><dd>{stats.topRate ?? "—"}</dd></div>
    <div><dt>連対率</dt><dd>{stats.reachRate ?? "—"}</dd></div>
    <div><dt>ラス回避率</dt><dd>{stats.bustAvoidanceRate ?? "—"}</dd></div>
    <div><dt>score合計</dt><dd>{stats.scoreTotal} pt</dd></div>
    <div><dt>score平均</dt><dd>{stats.scoreAverage ? `${stats.scoreAverage} pt` : "—"}</dd></div>
    <div><dt>現在連勝</dt><dd>{stats.currentWinStreak}</dd></div>
    <div><dt>最大連勝</dt><dd>{stats.maxWinStreak}</dd></div>
  </dl></section>;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [staff, { id }] = await Promise.all([requireStaff(), params]);
  if (!prisma) return <div className="page-content customers-page"><h1>顧客詳細</h1><p className="form-message">データベースへ接続できないため、顧客情報を読み込めません。</p></div>;
  const [customer, store] = await Promise.all([
    getCustomerDetails(prisma, staff.storeId, id),
    prisma.store.findUnique({ where: { id: staff.storeId }, select: { timezone: true } }),
  ]);
  if (!customer) notFound();
  const timezone = store?.timezone ?? staff.storeTimezone;
  const performance = await getCustomerPerformance(prisma, staff.storeId, id, timezone);
  if (!performance) notFound();
  const editAction = updateCustomerAction.bind(null, customer.id);

  return <div className="page-content customers-page">
    <div className="customer-detail-heading"><div><p className="eyebrow">CUSTOMER PROFILE</p><h1>{customer.internalName}</h1><p className="welcome-subtitle">顧客コード: {customer.customerCode}</p></div><span className={`customer-status ${customer.isActive ? "is-active" : "is-inactive"}`}>{customer.isActive ? "有効" : "無効"}</span></div>
    <section className="panel customer-info-panel"><h2>顧客情報</h2><dl className="customer-info-grid">
      <div><dt>内部管理名</dt><dd>{customer.internalName}</dd></div><div><dt>顧客コード</dt><dd>{customer.customerCode}</dd></div>
      <div><dt>登録日</dt><dd>{dateLabel(customer.createdAt, timezone)}</dd></div><div><dt>初回来店日</dt><dd>{dateLabel(customer.firstVisitAt, timezone)}</dd></div>
      <div><dt>最終来店日</dt><dd>{dateLabel(customer.lastVisitAt, timezone)}</dd></div><div><dt>状態</dt><dd>{customer.isActive ? "有効" : "無効"}</dd></div>
      <div className="form-span"><dt>内部メモ</dt><dd className="customer-note">{customer.note || "メモはありません"}</dd></div>
    </dl></section>
    <section className="panel customer-info-panel"><h2>公開プロフィール設定</h2>{customer.publicProfile ? <dl className="customer-info-grid"><div><dt>公開ニックネーム</dt><dd>{customer.publicProfile.nickname}</dd></div><div><dt>ランキング参加</dt><dd>{customer.publicProfile.rankingOptIn ? "参加中" : "不参加"}</dd></div><div><dt>プロフィール表示</dt><dd>{customer.publicProfile.profileVisible ? "公開" : "非公開"}</dd></div></dl> : <p className="customer-empty-inline">公開プロフィールは登録されていません。</p>}</section>
    <div className="performance-section-heading"><div><p className="eyebrow">PERSONAL PERFORMANCE</p><h2>個人成績</h2></div><Link className="text-link" href={`/admin/rankings?period=all&metric=scoreTotal`}>通算ランキングを見る →</Link></div>
    <PerformanceSection title="通算成績" stats={performance.allTime} />
    <PerformanceSection title={`${performance.monthLabel}の成績`} stats={performance.month} />
    <section className="panel customer-info-panel performance-panel"><h2>最近の対局</h2>{performance.recentGames.length ? <div className="customer-recent-games"><table><thead><tr><th>日時</th><th>卓</th><th>半荘</th><th>順位</th><th>最終持ち点</th><th>score</th></tr></thead><tbody>{performance.recentGames.map((game) => <tr key={game.id}><td>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(game.effectiveAt)}</td><td>{game.tableName}</td><td>{game.sequenceNumber}</td><td>{game.rank}位</td><td>{game.finalPoints.toLocaleString("ja-JP")}点</td><td>{scoreForDisplay(game.scoreScaled, game.scorePrecision)} pt</td></tr>)}</tbody></table></div> : <p className="customer-empty-inline">有効な対局記録はありません。</p>}</section>
    <section className="panel customer-form-panel"><h2>顧客情報を編集</h2><CustomerForm action={editAction} submitLabel="変更を保存" initial={{ customerCode: customer.customerCode, internalName: customer.internalName, note: customer.note ?? "", nickname: customer.publicProfile?.nickname ?? "", rankingOptIn: customer.publicProfile?.rankingOptIn ?? false, profileVisible: customer.publicProfile?.profileVisible ?? false }} /></section>
    {customer.isActive && (staff.role === Role.OWNER || staff.role === Role.MANAGER) && <section className="customer-danger-zone"><div><h2>顧客を無効化</h2><p>顧客と過去のGame履歴は保持され、通常ランキングからは除外されます。</p></div><DeactivateCustomerForm customerId={customer.id} /></section>}
    <Link className="back-link" href="/admin/customers">← 顧客一覧へ戻る</Link>
  </div>;
}
