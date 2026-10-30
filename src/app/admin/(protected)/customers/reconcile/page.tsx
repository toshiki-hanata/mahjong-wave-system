import Link from "next/link";
import { requireStaff } from "@/lib/auth/current-staff";
import { RosterReconciliationForm } from "@/features/customers/roster-reconciliation-form";

export default async function ReconcileCustomersPage() {
  await requireStaff();
  return <div className="page-content business-page">
    <header className="business-heading"><p className="eyebrow">CUSTOMER ROSTER</p><h1>紙・Excel名簿の照合</h1><p>今の会員名簿と見比べて、既存のお客さんを確認します。</p></header>
    <div className="business-links"><Link className="button button-secondary" href="/admin/customers">顧客管理へ</Link><Link className="button button-secondary" href="/admin/visits">受付へ</Link></div>
    <p className="business-warning">この画面は照合だけです。会員の登録・統合・来店受付・ポイント移行・スマホ連携は行いません。名前や会員番号が一致しても、本人確認が済んだことにはなりません。</p>
    <RosterReconciliationForm />
  </div>;
}
