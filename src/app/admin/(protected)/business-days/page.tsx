import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { getBusinessDayPageData } from "@/features/business-days/business-day-queries";
import { BusinessDayTimeForm, CloseBusinessDayForm, FreeGamePriceForm, OpenBusinessDayForm } from "@/features/business-days/business-day-controls";
import { businessDayLabel } from "@/features/business-days/business-day-service";

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
const time = (value: Date, timezone: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(value);

export default async function BusinessDaysPage() {
  const staff = await requireStaff();
  const canCorrect = staff.role === "OWNER" || staff.role === "MANAGER";
  const data = await getBusinessDayPageData(prisma, staff.storeId, canCorrect);
  if (!data) return <div className="page-content business-page"><h1>営業開始・終了</h1><p role="alert">データベースへ接続できません。</p></div>;
  const current = data.days.find((day) => !day.closedAt);
  const blocked = data.openVisits > 0 || data.activeTables > 0;
  const now = new Date();
  return <div className="page-content business-page">
    <header className="business-heading"><p className="eyebrow">STORE OPERATIONS</p><h1>営業開始・終了</h1><p>開始から終了までが1営業日。深夜0時を過ぎても同じ営業として記録します。</p></header>
    <section className="panel business-panel">
      <span className={`business-badge${current ? " is-open" : ""}`}>{current ? "営業中" : "営業していません"}</span>
      <h2>{current ? `${current.label} 開始の営業` : "準備ができたら営業を開始"}</h2>
      <p>{current ? `開始 ${time(current.openedAt, current.timezone)} ／ フリー1本 ${yen(current.freeGamePriceYen)}` : `次の営業のフリー1本 ${yen(data.nextPriceYen)}`}</p>
      {current && current.label !== businessDayLabel(now, current.timezone) && <p className="business-warning" role="status">開始日から日付が変わっています。営業終了の押し忘れがないか確認してください。終了忘れはOWNER／MANAGERが実際の終了日時を指定して処理できます。</p>}
      {!current && <OpenBusinessDayForm key={data.days[0]?.id ?? "first"} requestKey={randomUUID()} blocked={blocked} />}
      <div className="business-links"><Link className="button button-primary" href="/admin/visits">受付・退店へ</Link><Link className="button button-secondary" href="/admin/tables">卓・対局へ</Link></div>
    </section>
    {current && <section className="business-metrics" aria-label="今回の営業実績">
      <article className="panel"><span>フリー本数</span><strong>{current.metrics.games}<small>本</small></strong></article>
      <article className="panel"><span>フリー売上</span><strong>{yen(current.metrics.revenueYen)}</strong></article>
      <article className="panel"><span>来店実人数</span><strong>{current.metrics.customers}<small>人</small></strong></article>
      <article className="panel"><span>受付回数（再来店含む）</span><strong>{current.metrics.visits}<small>回</small></strong></article>
    </section>}
    {current && <section className="panel business-panel"><h2>卓ごとの本数・売上</h2>
      {current.tables.length ? <ul className="business-table-totals">{current.tables.map((table) => <li key={table.id}><strong>{table.name}</strong><span>{table.games}本</span><span>{yen(table.revenueYen)}</span></li>)}</ul> : <p>確定した半荘はまだありません。</p>}
      <p>確定した半荘1回＝1本。訂正前は数えません。ゲーム代バック・経費を引く前の金額です。</p>
    </section>}
    <section className="panel business-panel">
      <h2>{current ? "営業終了前の確認" : "前回の片付け状況"}</h2>
      <ul className="business-checks"><li>利用中の卓 <strong>{data.activeTables}卓</strong></li><li>未退店のお客さん <strong>{data.openVisits}人</strong></li></ul>
      {blocked && <p className="business-warning" role="status">先に卓を解放してから、来店中のお客さんを退店処理してください。以前の営業・テストで残ったものも対象です。</p>}
      {current && <CloseBusinessDayForm key={current.id} businessDayId={current.id} blocked={blocked} />}
      {current && canCorrect && <details className="business-time-details">
        <summary>営業終了を押し忘れた場合</summary>
        <p>実際の終了日時と理由を指定します。退店・卓終了・対局の記録より前の時刻にはできません。</p>
        <BusinessDayTimeForm key={`close-${current.id}-${current.openedAt.toISOString()}`} day={{ id: current.id, openedAt: current.openedAt.toISOString(), closedAt: null, timezone: current.timezone }} mode="close" requestKey={randomUUID()} defaultCloseAt={now.toISOString()} blocked={blocked} />
      </details>}
      {current && <p>未入力の半荘は自動では検知できません。最後の結果を保存してから終了してください。終了後は次の営業開始まで新しい受付・卓開始・結果入力はできません。</p>}
    </section>
    <section className="business-history"><h2>最近の営業履歴</h2>
      {!data.days.length && <p>営業を開始すると履歴が残ります。以前の対局履歴はこの集計に含めません。</p>}
      {data.days.map((day) => <article className="panel business-panel" key={day.id}>
        <h3>{day.label} 開始の営業 · {day.closedAt ? "終了" : "営業中"}</h3>
        <p>{time(day.openedAt, day.timezone)} 〜 {day.closedAt ? time(day.closedAt, day.timezone) : "営業中"}</p>
        <dl className="business-history-metrics"><div><dt>本数</dt><dd>{day.metrics.games}本</dd></div><div><dt>フリー売上</dt><dd>{yen(day.metrics.revenueYen)}</dd></div><div><dt>来店実人数</dt><dd>{day.metrics.customers}人</dd></div><div><dt>1本の料金</dt><dd>{yen(day.freeGamePriceYen)}</dd></div></dl>
        {canCorrect && <details className="business-time-details">
          <summary>{day.closedAt ? "開始・終了時刻を訂正" : "開始時刻を訂正"}</summary>
          <BusinessDayTimeForm key={`edit-${day.id}-${day.openedAt.toISOString()}-${day.closedAt?.toISOString() ?? "open"}`} day={{ id: day.id, openedAt: day.openedAt.toISOString(), closedAt: day.closedAt?.toISOString() ?? null, timezone: day.timezone }} mode="edit" requestKey={randomUUID()} defaultCloseAt={now.toISOString()} />
        </details>}
        {canCorrect && day.timeHistory.length > 0 && <details className="business-time-details">
          <summary>日時の訂正・終了忘れの履歴（{day.timeHistory.length}件）</summary>
          <ol className="business-time-history">{day.timeHistory.map((log) => <li key={log.id}>
            <p><strong>{time(log.at, day.timezone)} · {log.staffName}</strong></p>
            <p>変更前：{time(new Date(log.change.before.openedAt), log.change.timezone)} 〜 {log.change.before.closedAt ? time(new Date(log.change.before.closedAt), log.change.timezone) : "営業中"}</p>
            <p>変更後：{time(new Date(log.change.after.openedAt), log.change.timezone)} 〜 {log.change.after.closedAt ? time(new Date(log.change.after.closedAt), log.change.timezone) : "営業中"}</p>
            <p className="business-time-reason">理由：{log.change.reason}</p>
          </li>)}</ol>
        </details>}
      </article>)}
    </section>
    {(staff.role === "OWNER" || staff.role === "MANAGER") && <details className="panel business-panel"><summary>次の営業からのフリー料金を設定</summary><p>営業中・過去の単価と売上は変更しません。</p><FreeGamePriceForm priceYen={data.nextPriceYen} /></details>}
  </div>;
}
