import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { getStaffParticipationData } from "@/features/staff-participation/staff-participation-queries";

export default async function StaffGamesPage({ searchParams }: { searchParams: Promise<{ businessDayId?: string }> }) {
  const actor = await requireStaff();
  const params = await searchParams;
  if (params.businessDayId && params.businessDayId.length > 200) notFound();
  const data = await getStaffParticipationData(prisma, { storeId: actor.storeId, staffId: actor.id }, params.businessDayId);
  if (!data) return <div className="page-content business-page"><h1>スタッフ成績・参加本数</h1><p role="alert">参加情報を確認できません。営業の選択と接続状態を確認してください。</p></div>;
  const when = (date: Date) => new Intl.DateTimeFormat("ja-JP", { timeZone: data.selectedDay?.timezone ?? actor.storeTimezone, dateStyle: "short", timeStyle: "short" }).format(date);
  return <div className="page-content business-page">
    <header className="business-heading"><p className="eyebrow">STAFF PARTICIPATION</p><h1>スタッフ成績・参加本数</h1><p>{data.canViewAll ? "自店舗のスタッフ別に確認できます。" : "自分の参加本数と成績を確認できます。"} 訂正前の結果を重ねて数えません。</p></header>
    <div className="business-links"><Link className="button button-secondary" href="/admin/visits">スタッフ参加・終了へ</Link><Link className="button button-secondary" href="/admin/tables">卓・対局へ</Link></div>
    <section className="panel business-panel"><h2>営業ごとの参加本数</h2>
      <form method="get" className="business-controls"><label htmlFor="staff-games-day">対象の営業（最近30営業）</label><select id="staff-games-day" name="businessDayId" defaultValue={data.selectedDay?.id ?? ""} disabled={!data.days.length}>{!data.days.length && <option value="">営業の記録はまだありません</option>}{data.days.map((day) => <option key={day.id} value={day.id}>{day.label}開始 · {when(day.openedAt)} · {day.closedAt ? "終了" : "営業中"}</option>)}</select><button className="button button-secondary" disabled={!data.days.length}>表示する</button></form>
      <p>参加した半荘1回＝1本。店舗全体の本数とは別に、各スタッフの参加本数を記録します。現在はお客さん向けランキング・特典ポイントの対象外です（暫定）。</p>
    </section>
    {!data.staff.length && <p>確認できるスタッフ情報はありません。</p>}
    {data.staff.map((person) => <article className="panel business-panel" key={person.id}>
      <h2>{person.name}{!person.isActive && <span className="participant-staff-badge">無効アカウント・履歴</span>}</h2>
      <dl className="business-history-metrics"><div><dt>選択した営業の参加本数</dt><dd>{person.dayGames}本</dd></div><div><dt>通算参加本数</dt><dd>{person.stats.gamesPlayed}本</dd></div><div><dt>通算平均順位</dt><dd>{person.stats.averageRank ?? "—"}</dd></div><div><dt>通算成績スコア</dt><dd>{person.stats.scoreTotal}</dd></div></dl>
      <details className="business-time-details"><summary>成績と最近の対局を確認</summary><p>1着 {person.stats.firsts}回 ／ 2着 {person.stats.seconds}回 ／ 3着 {person.stats.thirds}回 ／ 4着 {person.stats.fourths}回</p><p>トップ率 {person.stats.topRate ?? "—"} ／ 連対率 {person.stats.reachRate ?? "—"} ／ ラス回避率 {person.stats.bustAvoidanceRate ?? "—"}</p>
        {person.recentGames.length ? <ul className="staff-game-history">{person.recentGames.map((game) => <li key={game.id}><span>{when(game.effectiveAt)} · {game.tableName} · 第{game.sequenceNumber}半荘</span><strong>{game.rank}位 · {game.finalPoints.toLocaleString("ja-JP")}点</strong></li>)}</ul> : <p>この営業の有効な対局はまだありません。</p>}
      </details>
    </article>)}
  </div>;
}
