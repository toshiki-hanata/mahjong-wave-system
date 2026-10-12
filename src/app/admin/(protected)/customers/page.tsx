import Link from "next/link";
import { searchCustomers } from "@/features/customers/customer-search";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/current-staff";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [staff, params] = await Promise.all([requireStaff(), searchParams]);
  const query = (params.q ?? "").slice(0, 100);
  const customers = prisma ? await searchCustomers(prisma, staff.storeId, query, { includeInactive: true }) : [];

  return <div className="page-content customers-page">
    <header className="customers-heading"><div><p className="eyebrow">CUSTOMER MANAGEMENT</p><h1>顧客管理</h1><p className="welcome-subtitle">店舗内の顧客情報と公開プロフィールを管理します。</p></div><Link className="button button-primary" href="/admin/customers/new">＋ 顧客を登録</Link></header>
    {!prisma && <p className="form-message" role="status">DATABASE_URLが未設定のため、顧客データを読み込めません。</p>}
    <form className="customer-search" action="/admin/customers" role="search">
      <label htmlFor="customer-search-input">顧客検索</label><div><input id="customer-search-input" name="q" type="search" maxLength={100} placeholder="顧客コード・内部管理名・公開ニックネーム" defaultValue={query} /><button className="button button-secondary" type="submit">検索</button></div>
    </form>
    <section className="panel customer-list-panel" aria-label="顧客一覧">
      {customers.length ? <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>顧客コード</th><th>内部管理名</th><th>公開ニックネーム</th><th>ランキング参加</th><th>状態</th><th><span className="sr-only">詳細</span></th></tr></thead><tbody>
        {customers.map((customer) => <tr key={customer.id}><td data-label="顧客コード">{customer.customerCode}</td><td data-label="内部管理名"><strong>{customer.internalName}</strong></td><td data-label="公開ニックネーム">{customer.publicProfile?.nickname ?? "—"}</td><td data-label="ランキング参加">{customer.publicProfile?.rankingOptIn ? "参加中" : "不参加"}</td><td data-label="状態"><span className={`customer-status ${customer.isActive ? "is-active" : "is-inactive"}`}>{customer.isActive ? "有効" : "無効"}</span></td><td><Link className="text-link" href={`/admin/customers/${customer.id}`}>詳細 →</Link></td></tr>)}
      </tbody></table></div> : <div className="customer-empty"><strong>{query ? "該当する顧客がいません" : "顧客データはまだありません"}</strong><p>{query ? "検索語を変えてもう一度お試しください。" : "顧客を登録すると、この一覧に表示されます。"}</p></div>}
    </section>
    {customers.length > 0 && <p className="customer-count">{customers.length}件を表示（最大100件）</p>}
  </div>;
}
