import { StaffParticipationForm } from "@/features/staff-participation/staff-participation-form";
import { getAvailableStaffParticipants } from "@/features/staff-participation/staff-participation-queries";
import { participantName } from "@/features/staff-participation/participant-policy";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { VisitStatus } from "@prisma/client";
import { CheckInButton, CheckOutButton } from "@/features/visits/visit-action-buttons";
import { getOpenVisits, getVisitStatusCounts, formatVisitDateTime } from "@/features/visits/visit-queries";
import { normalizeCustomerSearchTerm, searchCustomers } from "@/features/customers/customer-search";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";
import { QuickReceptionForm } from "@/features/visits/quick-reception-form";

type VisitsPageProps = { searchParams: Promise<{ q?: string | string[]; notice?: string | string[] }> };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const statusLabel = { WAITING: "待機中", PLAYING: "対局中", CHECKED_OUT: "退店済み" } as const;

export default async function VisitsPage({ searchParams }: VisitsPageProps) {
  const staff = await requireRole(visitOperationRoles);
  const params = await searchParams;
  const query = normalizeCustomerSearchTerm(first(params.q));
  const notice = first(params.notice);
  const [visits, counts, customers, availableStaff] = await Promise.all([
    getOpenVisits(prisma, staff.storeId),
    getVisitStatusCounts(prisma, staff.storeId),
    prisma && query ? searchCustomers(prisma, staff.storeId, query, { limit: 20, includeInactive: true }) : Promise.resolve([]),
    getAvailableStaffParticipants(prisma, staff.storeId),
  ]);
  const waitingVisits = visits.filter((visit) => visit.status === VisitStatus.WAITING);
  const playingVisits = visits.filter((visit) => visit.status === VisitStatus.PLAYING);
  const staffRequestKey = randomUUID();
  const openCustomerIds = new Set(visits.map((visit) => visit.customer.id));

  return <div className="page-content visits-page">
    <header className="visits-heading">
      <div>
        <p className="eyebrow">STORE OPERATIONS</p>
        <h1>受付・来店中</h1>
        <p className="visits-subtitle">お客さんを検索して受付。初めての方は、この画面で登録できます。</p>
      </div>
      <Link className="button button-secondary" href="/admin/tables">卓に配置する →</Link>
    </header>

    {notice === "staff-joined" && <p className="visit-notice" role="status">スタッフを待機に追加しました。卓画面で席を選択できます。</p>}
    {notice === "checked-out" && <p className="visit-notice" role="status">チェックアウトしました。</p>}
    {!prisma && <p className="visit-notice" role="status">データベースに接続できません。</p>}

    <section className="visit-count-grid" aria-label="現在の来店状況">
      <article className="visit-count-card visit-count-total"><span>来店・参加人数</span><strong>{counts?.total ?? "—"}<small>名</small></strong></article>
      <article className="visit-count-card visit-count-waiting"><span>待機中</span><strong>{counts?.waiting ?? "—"}<small>名</small></strong></article>
      <article className="visit-count-card visit-count-playing"><span>対局中</span><strong>{counts?.playing ?? "—"}<small>名</small></strong></article>
    </section>

    <section className="panel visit-search-panel">
      <div className="visit-section-heading"><div><h2>1. 登録済みのお客さんを検索</h2><p>お名前・呼び名・会員番号で探せます。無効の登録も表示します。</p></div></div>
      <form className="visit-customer-search" method="get">
        <label htmlFor="visit-customer-query">お名前・呼び名・会員番号</label>
        <div><input id="visit-customer-query" name="q" type="search" maxLength={100} defaultValue={query} placeholder="例：佐藤、W0001" /><button className="button button-primary" type="submit">検索</button></div>
      </form>
      {query && <div className="visit-search-results" aria-live="polite">
        {customers.length === 0 ? <p className="visit-empty">登録が見つかりません。検索語を変えるか、下から新規登録してください。</p> : customers.map((customer) => <article className="visit-customer-result" key={customer.id}>
          <div><strong>{customer.internalName}</strong><span>会員番号: {customer.customerCode}{!customer.isActive ? " · 無効" : ""}</span></div>
          {openCustomerIds.has(customer.id) ? <span className="visit-action-result">受付済み</span> : customer.isActive ? <CheckInButton customerId={customer.id} /> : <Link className="button button-secondary" href={`/admin/customers/${customer.id}`}>顧客情報を確認</Link>}
        </article>)}
        {customers.length === 20 && <p className="reception-help">最大20件を表示しています。お名前や会員番号を追加して絞り込んでください。</p>}
      </div>}
    </section>

    <section className="panel visit-search-panel" aria-labelledby="quick-reception-title">
      <div className="visit-section-heading"><div><h2 id="quick-reception-title">2. 初めてのお客さんを登録・受付</h2><p>入力するのはお名前だけ。登録後すぐに待機中へ追加します。</p></div></div>
      <QuickReceptionForm key={query} initialRequestId={randomUUID()} initialName={query} />
    </section>

    <details className="panel business-panel"><summary>スタッフを参加させる</summary><p>登録済みのスタッフを待機に追加します。参加終了は待機に戻してから行います。</p><StaffParticipationForm key={staffRequestKey} requestKey={staffRequestKey} staff={availableStaff.map((person) => ({ ...person, alreadyParticipating: visits.some((visit) => visit.customer.participantStaffId === person.id) }))} /><Link className="text-link" href="/admin/staff-games">スタッフ成績・参加本数へ →</Link></details>

    <section className="visit-open-section" aria-labelledby="open-visits-title">
      <div className="visit-section-heading visit-list-heading"><div><h2 id="open-visits-title">来店・スタッフ参加一覧</h2><p>日付をまたいだ未退店Visitも表示します。</p></div><span className="visit-open-count">{counts?.total ?? 0}名</span></div>
      <div className="visit-status-columns">
        {[{ status: VisitStatus.WAITING, visits: waitingVisits }, { status: VisitStatus.PLAYING, visits: playingVisits }].map((group) => <section className="panel visit-status-panel" key={group.status}>
          <header><h3>{statusLabel[group.status]}</h3><span>{group.visits.length}</span></header>
          {group.visits.length === 0 ? <p className="visit-empty">該当する来店はありません。</p> : <ul className="visit-list">{group.visits.map((visit) => <li className="visit-list-row" key={visit.id}>
            <div className="visit-customer-info"><strong>{participantName(visit.customer)}</strong><span>{visit.customer.participantStaffId ? "スタッフ参加" : visit.customer.customerCode}</span><time dateTime={visit.checkedInAt.toISOString()}>受付 {formatVisitDateTime(visit.checkedInAt, staff.storeTimezone)}</time></div>
            {visit.status === VisitStatus.WAITING ? <CheckOutButton visitId={visit.id} label={visit.customer.participantStaffId ? "参加を終了" : "退店する"} /> : <p className="visit-playing-hint">卓から外して待機中に戻してから退店・参加終了できます。</p>}
          </li>)}</ul>}
        </section>)}
      </div>
    </section>
  </div>;
}
