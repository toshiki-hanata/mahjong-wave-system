import Link from "next/link";
import { participantName, participantCode } from "@/features/staff-participation/participant-policy";
import { Role } from "@prisma/client";
import { CreateTableForm, DeactivateTableForm, EndTableForm, StartTableForm, TableMasterForm } from "@/features/tables/table-actions";
import { getTablePageData } from "@/features/tables/table-queries";
import { tableOperationRoles } from "@/features/tables/table-permissions";
import { formatVisitDateTime } from "@/features/visits/visit-queries";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { seatingToken } from "@/features/tables/seat-snapshot";
import { MemberChangeForm } from "@/features/tables/member-change-form";

const actionErrors: Record<string, string> = {
  "invalid-game-input": "持ち点の入力を確認してください。",
  database: "データベースへ接続できません。",
  "session-unavailable": "稼働中のTableSessionがありません。画面を更新してください。",
  "seat-integrity": "4席の来店・顧客状態を確認できません。卓画面を更新してください。",
  "rule-unavailable": "有効な半荘ルールがありません。OWNER/MANAGERが確認してください。",
  "idempotency-conflict": "同じ送信キーに異なる入力がありました。画面を更新して再入力してください。",
  "game-conflict": "別の操作と競合しました。最新の状態を確認してください。",
  "invalid-correction": "訂正内容と必須理由を確認してください。",
  "not-correctable": "このGameは訂正できない状態です。画面を更新してください。",
};

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ error?: string; inactive?: string; state?: string | string[] }> }) {
  const staff = await requireRole(tableOperationRoles);
  const { error, inactive, state } = await searchParams;
  const { tables, waitingVisits, recentSessions } = await getTablePageData(prisma, staff.storeId);
  const canManage = staff.role === Role.OWNER || staff.role === Role.MANAGER;
  const showInactive = canManage && inactive === "1";
  const selectedState = state === "available" || state === "free" ? state : "all";
  const activeTables = tables.filter((table) => table.isActive);
  const availableCount = activeTables.filter((table) => !table.sessions.length).length;
  const freeCount = activeTables.length - availableCount;
  const visibleTables = tables.filter((table) => (table.isActive || showInactive)
    && (selectedState === "all" || (table.isActive && (selectedState === "free" ? table.sessions.length > 0 : table.sessions.length === 0))));
  const listHref = (filter: string, includeInactive = showInactive) => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("state", filter);
    if (includeInactive) params.set("inactive", "1");
    return "/admin/tables" + (params.size ? "?" + params.toString() : "");
  };
  const inactiveCount = tables.filter((table) => !table.isActive).length;

  return <div className="page-content tables-page">
    {error && actionErrors[error] && <p className="game-warning" role="alert">{actionErrors[error]}</p>}
    <nav className="operation-flow-nav" aria-label="営業中の主な操作"><Link href="/admin/visits" prefetch={false}>受付・退店</Link><Link href="/admin/tables" prefetch={false} aria-current="page">卓・結果入力</Link><Link href="/admin/business-days" prefetch={false}>営業終了</Link></nav>
    <header className="tables-heading"><div><p className="eyebrow">STORE OPERATIONS</p><h1>卓・対局</h1><p className="tables-subtitle">使っている卓のカードから、結果入力・交代・卓終了へ進めます。</p></div><a className="button button-secondary" href="/admin/visits">受付・退店へ</a></header>
    {!prisma && <p className="table-empty-state">データベースに接続できません。</p>}

    <section className="tables-section" aria-labelledby="tables-list-title">
      <div className="table-section-heading"><div><h2 id="tables-list-title">店舗の卓</h2><p>空き卓から待機客4人を選ぶと開始できます。{waitingVisits.length < 4 && <a className="table-reception-shortcut" href="/admin/visits">あと{4 - waitingVisits.length}人を受付する →</a>}</p></div><span className="waiting-total">待機中 <strong>{waitingVisits.length}</strong> 名</span></div>
      {canManage && inactiveCount > 0 && <p className="table-help"><a href={showInactive ? listHref(selectedState, false) : listHref("all", true)}>{showInactive ? "営業用の卓だけ表示する" : `保管・無効の卓 ${inactiveCount}件を確認`}</a></p>}
      {tables.length === 0 && <p className="table-empty-state">卓マスタはまだありません。OWNERまたはMANAGERが下のフォームから卓を追加できます。</p>}
      <nav className="table-state-filter" aria-label="卓の状態で絞り込む">
        <a href={listHref("all")} aria-current={selectedState === "all" ? "page" : undefined}><span>すべての営業卓</span><strong>{prisma ? activeTables.length : "—"}<small>卓</small></strong></a>
        <a href={listHref("available")} aria-current={selectedState === "available" ? "page" : undefined}><span>空き卓</span><strong>{prisma ? availableCount : "—"}<small>卓</small></strong></a>
        <a href={listHref("free")} aria-current={selectedState === "free" ? "page" : undefined}><span>フリー</span><strong>{prisma ? freeCount : "—"}<small>卓</small></strong></a>
      </nav>
      {tables.length > 0 && visibleTables.length === 0 && <p className="table-empty-state" role="status">{selectedState === "available" ? "現在、空き卓はありません。" : selectedState === "free" ? "現在、フリーで利用中の卓はありません。" : "営業用の卓がありません。OWNERまたはMANAGERが卓の設定を確認してください。"}</p>}
      <div className="table-card-grid">
        {visibleTables.map((table) => {
          const session = table.sessions[0];
          const seats = session?.seats ?? [];
          return <article className={`panel table-operation-card${!table.isActive ? " is-inactive" : ""}`} id={`table-${table.id}`} key={table.id}>
            <header className="table-card-heading"><div><span className={`table-state-dot${session ? " is-playing" : ""}`} /><div><h3>{table.name}</h3><p>{!table.isActive ? "無効" : session ? "フリー" : "空き卓"}{session ? ` · 開始 ${formatVisitDateTime(session.startedAt, staff.storeTimezone)}` : ""}</p></div></div><span className="table-order">順序 {table.sortOrder}</span></header>
            {session ? <>
              <div className="physical-seat-grid">{[1, 2, 3, 4].map((position) => {
                const seat = seats.find((item) => item.position === position);
                return <div className="physical-seat" key={position}><span>座席 {position}</span>{seat ? <><strong>{participantName(seat.visit.customer)}</strong><small>{participantCode(seat.visit.customer)}</small></> : <strong className="seat-missing">空席情報なし</strong>}</div>;
              })}</div>
              <div className="table-progress-summary" aria-label={`${table.name}の記録状況`}><span><strong>{session._count.games}</strong>本の結果を保存済み</span><span>次の記録は <b>第{session._count.games + 1}半荘</b></span></div>
              <div className="table-game-links"><a className="button button-primary" href={`/admin/tables/${session.id}/games/new`}>半荘結果を入力</a><a className="button button-secondary" href={`/admin/tables/${session.id}/games`}>半荘履歴</a></div>
              <p className="table-help">半荘が終わったら、点数または着順だけを入力して保存してください。</p>
              <details className="table-start-details"><summary>1人交代・席替え</summary><MemberChangeForm key={`${seatingToken(seats)}-${session._count.games}`} sessionId={session.id} requestKey={randomUUID()} seatingToken={seatingToken(seats)} expectedSequence={session._count.games + 1} seats={seats.map((seat) => ({ position: seat.position, name: participantName(seat.visit.customer) }))} waitingVisits={waitingVisits} /></details>
              <details className="table-end-details"><summary>この卓の利用を終了する</summary><p className="table-help">最後の半荘を保存したことを確認してください。卓を終了すると4人は待機中へ戻ります。退店はその後に行います。</p><EndTableForm sessionId={session.id} /><a className="button button-secondary" href="/admin/visits#open-visits-title">退店する人を確認する</a></details>
            </> : table.isActive ? <details className="table-start-details"><summary>待機客を選んで開始</summary><StartTableForm tableId={table.id} waitingVisits={waitingVisits.map((visit) => ({ ...visit, checkedInAt: visit.checkedInAt.toISOString() }))} /></details> : <p className="table-help">無効化されています。</p>}
            {canManage && <details className="table-master-details"><summary>卓マスタを編集</summary><TableMasterForm table={table} />{table.isActive && <DeactivateTableForm tableId={table.id} />}</details>}
          </article>;
        })}
      </div>
    </section>

    <section className="panel waiting-panel" aria-labelledby="waiting-visits-title">
      <div className="table-section-heading"><div><h2 id="waiting-visits-title">待機中のお客さん・スタッフ</h2><p>卓開始フォームで席へ割り当てます。チェックアウトは来店管理画面から行います。</p></div><span className="waiting-total"><strong>{waitingVisits.length}</strong> 名</span></div>
      {waitingVisits.length === 0 ? <p className="table-empty-state">待機中のお客さん・スタッフはいません。</p> : <ul className="waiting-visit-list">{waitingVisits.map((visit) => <li key={visit.id}><div><strong>{participantName(visit.customer)}</strong><span>{participantCode(visit.customer)}</span></div><time dateTime={visit.checkedInAt.toISOString()}>{formatVisitDateTime(visit.checkedInAt, staff.storeTimezone)}</time></li>)}</ul>}
    </section>

    <details className="panel game-session-history table-history-details"><summary>最近の卓利用・半荘履歴</summary><div className="table-section-heading"><div><h2>最近の卓利用</h2><p>終了した卓の半荘履歴も確認できます。</p></div>{canManage && <a className="text-link" href="/admin/store-rules">半荘ルール設定 →</a>}</div>
      {recentSessions.length === 0 ? <p className="table-empty-state">Session履歴はありません。</p> : <ul>{recentSessions.map((session) => <li key={session.id}><div><strong>{session.mahjongTable.name}</strong><span>{session.status === "ACTIVE" ? "稼働中" : "終了"} · {session._count.games}半荘</span></div><time>{formatVisitDateTime(session.startedAt, staff.storeTimezone)}</time><a href={`/admin/tables/${session.id}/games`}>履歴を見る →</a></li>)}</ul>}
    </details>

    {canManage && <section className="panel table-create-panel"><div className="table-section-heading"><div><h2>卓を追加</h2><p>初期卓数は固定されていません。店舗の運用に合わせて登録できます。</p></div></div><CreateTableForm /></section>}
  </div>;
}
