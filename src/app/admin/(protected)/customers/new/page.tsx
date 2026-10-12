import Link from "next/link";
import { CustomerForm } from "@/features/customers/customer-form";
import { createCustomerAction } from "../actions";
import { requireStaff } from "@/lib/auth/current-staff";

export default async function NewCustomerPage() {
  await requireStaff();
  return <div className="page-content customers-page">
    <p className="eyebrow">CUSTOMER MANAGEMENT</p><h1 className="customer-page-title">顧客を登録</h1>
    <p className="welcome-subtitle">店舗内で使う顧客情報を登録します。</p>
    <section className="panel customer-form-panel"><CustomerForm action={createCustomerAction} submitLabel="顧客を登録" /></section>
    <Link className="back-link" href="/admin/customers">← 顧客一覧へ戻る</Link>
  </div>;
}
