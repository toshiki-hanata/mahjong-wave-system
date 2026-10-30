import Link from "next/link";
import type { OperationalDashboardData } from "./get-dashboard-data";

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
const time = (value: Date, timezone: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);

export function OperationalDashboard({ data, staffName, timezone }: { data: OperationalDashboardData | null; staffName: string; timezone: string }) {
  return <div className="page-content operations-home">
    <header className="business-heading"><p className="eyebrow">STORE OPERATIONS</p><h1>店舗ホーム</h1><p>{staffName}さん · 受付から営業終了まで、ここから進められます。</p></header>
    <nav className="operations-entry" aria-label="主な業務">
      <Link className="button button-primary" href="/admin/visits">受付・退店</Link>
      <Link className="button button-secondary" href="/admin/tables">卓・結果入力</Link>
      <Link className="button button-secondary" href="/admin/business-days">営業開始・終了</Link>
    </nav>
    {!data ? <section className="panel business-panel"><p role="alert">データベースへ接続できません。営業状況を確認できないため、数値は表示していません。</p></section> : <>
      <section className="panel business-panel">
        <h2>{data.currentDay ? `${data.currentDay.label} 開始の営業` : "営業していません"}</h2>
        <p>{data.currentDay ? `開始 ${time(data.currentDay.openedAt, data.currentDay.timezone)} · フリー1本 ${yen(data.currentDay.freeGamePriceYen)}` : "営業開始後に、今回の本数・売上・来店実人数を表示します。"}</p>
        {!data.currentDay && <Link className="text-link" href="/admin/business-days">営業を開始する →</Link>}
        <p className="operations-data-note">この店舗の登録データを表示しています。</p>
      </section>
      <section className="business-metrics" aria-label="営業と来店の実績">
        <article className="panel"><span>今回のフリー本数</span><strong>{data.metrics?.games ?? "—"}<small>本</small></strong></article>
        <article className="panel"><span>今回のフリー売上</span><strong>{data.metrics ? yen(data.metrics.revenueYen) : "—"}</strong></article>
        <article className="panel"><span>今回の来店実人数</span><strong>{data.metrics?.customers ?? "—"}<small>人</small></strong></article>
        <article className="panel"><span>現在の待機／対局中</span><strong>{data.waiting}／{data.playing}<small>人</small></strong></article>
      </section>
      <section className="panel business-panel">
        <div className="operations-section-heading"><h2>現在の卓</h2><Link className="text-link" href="/admin/tables">卓を操作する →</Link></div>
        <p>稼働中 {data.activeTables}卓 ／ 空き {data.availableTables}卓</p>
        {!data.currentDay && (data.waiting > 0 || data.playing > 0 || data.activeTables > 0) && <p className="business-warning">以前の未処理データが残っています。卓の解放・退店を済ませてから営業を開始してください。</p>}
        <ul className="operations-table-list">{data.tables.map((table) => {
          const session = table.sessions[0];
          return <li key={table.id}>
            <div className="operations-section-heading"><strong>{table.name}</strong><span className={`business-badge${session ? " is-open" : ""}`}>{session ? "フリー" : "空き"}</span></div>
            {session ? <>
              <p>開始 {time(session.startedAt, data.currentDay?.timezone ?? timezone)}</p>
              <p className="operations-players">{session.seats.map((seat) => `席${seat.position}：${seat.visit.customer.internalName}`).join(" ／ ")}</p>
              <Link className="button button-secondary" href={`/admin/tables/${session.id}/games/new`}>結果を入力する</Link>
            </> : <Link className="button button-secondary" href="/admin/tables">待機客を選んで開始</Link>}
          </li>;
        })}</ul>
        {!data.tables.length && <p>有効な卓がありません。卓画面で登録してください。</p>}
      </section>
      <section className="panel business-panel">
        <div className="operations-section-heading"><h2>今回の最近の結果</h2><Link className="text-link" href="/admin/tables">半荘履歴へ →</Link></div>
        <ul className="operations-results">{data.recentGames.map((game) => <li key={game.id}>
          <Link href={`/admin/tables/${game.tableSessionId}/games/${game.id}`}><strong>{game.tableSession.mahjongTable.name} · 第{game.sequenceNumber}半荘</strong><span>{time(game.effectiveAt, data.currentDay?.timezone ?? timezone)} · 確定 →</span></Link>
        </li>)}</ul>
        {!data.recentGames.length && <p>{data.currentDay ? "この営業の確定した半荘はまだありません。" : "営業開始後に、今回の結果を表示します。"}</p>}
        <p>過去の営業の本数・売上は<Link className="text-link" href="/admin/business-days">営業履歴</Link>で確認できます。</p>
      </section>
    </>}
    <nav className="operations-related" aria-label="顧客と成績"><Link className="text-link" href="/admin/customers">顧客名簿 →</Link><Link className="text-link" href="/admin/rankings">店内ランキング →</Link></nav>
  </div>;
}
