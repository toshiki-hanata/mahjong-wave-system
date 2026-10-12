import Link from "next/link";
import { VisitStatus } from "@prisma/client";
import { CheckInButton, CheckOutButton } from "@/features/visits/visit-action-buttons";
import { getOpenVisits, getVisitStatusCounts, formatVisitDateTime } from "@/features/visits/visit-queries";
import { searchCustomers } from "@/features/customers/customer-search";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";

type VisitsPageProps = { searchParams: Promise<{ q?: string | string[]; notice?: string | string[] }> };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const statusLabel = { WAITING: "待機中", PLAYING: "対局中", CHECKED_OUT: "退店済み" } as const;

export default async function VisitsPage({ searchParams }: VisitsPageProps) {
  const staff = await requireRole(visitOperationRoles);
  const params = await searchParams;
  const query = first(params.q).trim();
  const notice = first(params.notice);
  const [visits, counts, customers] = await Promise.all([
    getOpenVisits(prisma, staff.storeId),
    getVisitStatusCounts(prisma, staff.storeId),
    prisma && query ? searchCustomers(prisma, staff.storeId, query, { limit: 20 }) : Promise.resolve([]),
  ]);
  const waitingVisits = visits.filter((visit) => visit.status === VisitStatus.WAITING);
  const playingVisits = visits.filter((visit) => visit.status === VisitStatus.PLAYING);

  return <div className="page-content visits-page">
    <header className="visits-heading">
      <div>
        <p className="eyebrow">STORE OPERATIONS</p>
        <h1>来店管理</h1>
        <p className="visits-subtitle">受付・来店中の確認・退店処理</p>
      </div>
      <Link className="button button-secondary" href="/admin/customers/new">顧客を登録</Link>
    </header>

    {notice === "checked-out" && <p className="visit-notice" role="status">チェックアウトしました。</p>}
    {!prisma && <p className="visit-notice" role="status">データベースに接続できません。</p>}

    <section className="visit-count-grid" aria-label="現在の来店状況">
      <article className="visit-count-card visit-count-total"><span>現在の来店人数</span><strong>{counts?.total ?? "—"}<small>名</small></strong></article>
      <article className="visit-count-card visit-count-waiting"><span>待機中</span><strong>{counts?.waiting ?? "—"}<small>名</small></strong></article>
      <article className="visit-count-card visit-count-playing"><span>対局中</span><strong>{counts?.playing ?? "—"}<small>名</small></strong></article>
    </section>

    <section className="panel visit-search-panel">
      <div className="visit-section-heading"><div><h2>来店受付</h2><p>登録済みの有効な顧客を検索してチェックインします。</p></div></div>
      <form className="visit-customer-search" method="get">
        <label htmlFor="visit-customer-query">顧客コード・管理名・公開ニックネーム</label>
        <div><input id="visit-customer-query" name="q" type="search" defaultValue={query} placeholder="顧客を検索" /><button className="button button-primary" type="submit">検索</button></div>
      </form>
      {query && <div className="visit-search-results" aria-live="polite">
        {customers.length === 0 ? <p className="visit-empty">該当する有効顧客が見つかりません。</p> : customers.map((customer) => <article className="visit-customer-result" key={customer.id}>
          <div><strong>{customer.internalName}</strong><span>顧客コード: {customer.customerCode}</span></div>
          <CheckInButton customerId={customer.id} />
        </article>)}
      </div>}
    </section>

    <section className="visit-open-section" aria-labelledby="open-visits-title">
      <div className="visit-section-heading visit-list-heading"><div><h2 id="open-visits-title">現在の来店中一覧</h2><p>日付をまたいだ未退店Visitも表示します。</p></div><span className="visit-open-count">{counts?.total ?? 0}名</span></div>
      <div className="visit-status-columns">
        {[{ status: VisitStatus.WAITING, visits: waitingVisits }, { status: VisitStatus.PLAYING, visits: playingVisits }].map((group) => <section className="panel visit-status-panel" key={group.status}>
          <header><h3>{statusLabel[group.status]}</h3><span>{group.visits.length}</span></header>
          {group.visits.length === 0 ? <p className="visit-empty">該当する来店はありません。</p> : <ul className="visit-list">{group.visits.map((visit) => <li className="visit-list-row" key={visit.id}>
            <div className="visit-customer-info"><strong>{visit.customer.internalName}</strong><span>{visit.customer.customerCode}</span><time dateTime={visit.checkedInAt.toISOString()}>受付 {formatVisitDateTime(visit.checkedInAt, staff.storeTimezone)}</time></div>
            {visit.status === VisitStatus.WAITING ? <CheckOutButton visitId={visit.id} /> : <p className="visit-playing-hint">卓から外して待機中に戻してから退店できます。</p>}
          </li>)}</ul>}
        </section>)}
      </div>
    </section>
  </div>;
}
