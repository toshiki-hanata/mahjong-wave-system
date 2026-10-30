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

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ error?: string; inactive?: string }> }) {
  const staff = await requireRole(tableOperationRoles);
  const { error, inactive } = await searchParams;
  const { tables, waitingVisits, recentSessions } = await getTablePageData(prisma, staff.storeId);
  const canManage = staff.role === Role.OWNER || staff.role === Role.MANAGER;
  const showInactive = canManage && inactive === "1";
  const visibleTables = tables.filter((table) => table.isActive || showInactive);
  const inactiveCount = tables.filter((table) => !table.isActive).length;

  return <div className="page-content tables-page">
    {error && actionErrors[error] && <p className="game-warning" role="alert">{actionErrors[error]}</p>}
    <header className="tables-heading"><div><p className="eyebrow">STORE OPERATIONS</p><h1>卓・対局</h1><p className="tables-subtitle">卓を選んで開始・結果入力・メンバー交代</p></div><a className="button button-secondary" href="/admin/visits">受付・退店へ</a></header>
    {!prisma && <p className="table-empty-state">データベースに接続できません。</p>}

    <section className="tables-section" aria-labelledby="tables-list-title">
      <div className="table-section-heading"><div><h2 id="tables-list-title">店舗の卓</h2><p>空き卓から待機客4人を選ぶと開始できます。</p></div><span className="waiting-total">待機中 <strong>{waitingVisits.length}</strong> 名</span></div>
      {canManage && inactiveCount > 0 && <p className="table-help"><a href={showInactive ? "/admin/tables" : "/admin/tables?inactive=1"}>{showInactive ? "営業用の卓だけ表示する" : `保管・無効の卓 ${inactiveCount}件を確認`}</a></p>}
      {tables.length === 0 && <p className="table-empty-state">卓マスタはまだありません。OWNERまたはMANAGERが下のフォームから卓を追加できます。</p>}
      <div className="table-card-grid">
        {visibleTables.map((table) => {
          const session = table.sessions[0];
          const seats = session?.seats ?? [];
          return <article className={`panel table-operation-card${!table.isActive ? " is-inactive" : ""}`} key={table.id}>
            <header className="table-card-heading"><div><span className={`table-state-dot${session ? " is-playing" : ""}`} /><div><h3>{table.name}</h3><p>{!table.isActive ? "無効" : session ? "稼働中" : "空き卓"}{session ? ` · 開始 ${formatVisitDateTime(session.startedAt, staff.storeTimezone)}` : ""}</p></div></div><span className="table-order">順序 {table.sortOrder}</span></header>
            {session ? <>
              <div className="physical-seat-grid">{[1, 2, 3, 4].map((position) => {
                const seat = seats.find((item) => item.position === position);
                return <div className="physical-seat" key={position}><span>座席 {position}</span>{seat ? <><strong>{seat.visit.customer.internalName}</strong><small>{seat.visit.customer.customerCode}</small></> : <strong className="seat-missing">空席情報なし</strong>}</div>;
              })}</div>
              <div className="table-game-links"><a className="button button-primary" href={`/admin/tables/${session.id}/games/new`}>半荘結果を入力</a><a className="button button-secondary" href={`/admin/tables/${session.id}/games`}>半荘履歴</a></div>
              <p className="table-help">確定済み {session._count.games}本</p>
              <details className="table-start-details"><summary>1人交代・席替え</summary><MemberChangeForm key={`${seatingToken(seats)}-${session._count.games}`} sessionId={session.id} requestKey={randomUUID()} seatingToken={seatingToken(seats)} expectedSequence={session._count.games + 1} seats={seats.map((seat) => ({ position: seat.position, name: seat.visit.customer.internalName }))} waitingVisits={waitingVisits} /></details>
              <EndTableForm sessionId={session.id} />
            </> : table.isActive ? <details className="table-start-details"><summary>待機客を選んで開始</summary><StartTableForm tableId={table.id} waitingVisits={waitingVisits.map((visit) => ({ ...visit, checkedInAt: visit.checkedInAt.toISOString() }))} /></details> : <p className="table-help">無効化されています。</p>}
            {canManage && <details className="table-master-details"><summary>卓マスタを編集</summary><TableMasterForm table={table} />{table.isActive && <DeactivateTableForm tableId={table.id} />}</details>}
          </article>;
        })}
      </div>
    </section>

    <section className="panel waiting-panel" aria-labelledby="waiting-visits-title">
      <div className="table-section-heading"><div><h2 id="waiting-visits-title">待機中の顧客</h2><p>卓開始フォームで席へ割り当てます。チェックアウトは来店管理画面から行います。</p></div><span className="waiting-total"><strong>{waitingVisits.length}</strong> 名</span></div>
      {waitingVisits.length === 0 ? <p className="table-empty-state">待機中の顧客はいません。</p> : <ul className="waiting-visit-list">{waitingVisits.map((visit) => <li key={visit.id}><div><strong>{visit.customer.internalName}</strong><span>{visit.customer.customerCode}</span></div><time dateTime={visit.checkedInAt.toISOString()}>{formatVisitDateTime(visit.checkedInAt, staff.storeTimezone)}</time></li>)}</ul>}
    </section>

    <details className="panel game-session-history table-history-details"><summary>最近の卓利用・半荘履歴</summary><div className="table-section-heading"><div><h2>最近の卓利用</h2><p>終了した卓の半荘履歴も確認できます。</p></div>{canManage && <a className="text-link" href="/admin/store-rules">半荘ルール設定 →</a>}</div>
      {recentSessions.length === 0 ? <p className="table-empty-state">Session履歴はありません。</p> : <ul>{recentSessions.map((session) => <li key={session.id}><div><strong>{session.mahjongTable.name}</strong><span>{session.status === "ACTIVE" ? "稼働中" : "終了"} · {session._count.games}半荘</span></div><time>{formatVisitDateTime(session.startedAt, staff.storeTimezone)}</time><a href={`/admin/tables/${session.id}/games`}>履歴を見る →</a></li>)}</ul>}
    </details>

    {canManage && <section className="panel table-create-panel"><div className="table-section-heading"><div><h2>卓を追加</h2><p>初期卓数は固定されていません。店舗の運用に合わせて登録できます。</p></div></div><CreateTableForm /></section>}
  </div>;
}
