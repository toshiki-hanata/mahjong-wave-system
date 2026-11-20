import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";
import { normalizeCustomerSearchTerm, searchCustomers } from "@/features/customers/customer-search";
import { qrReceptionEnabled } from "@/features/qr-reception/policy";
import { ReceptionReviewForm, RejectReceptionForm } from "@/features/qr-reception/controls";

export const dynamic = "force-dynamic";
export default async function ReceptionReviewPage({ params, searchParams }: { params: Promise<{ requestId: string }>; searchParams: Promise<{ q?: string }> }) {
  const staff = await requireRole(visitOperationRoles);
  if (!qrReceptionEnabled() || !prisma) notFound();
  const { requestId } = await params; if (!requestId || requestId.length > 200) notFound();
  const request = await prisma.qrReceptionRequest.findFirst({ where: { id: requestId, storeId: staff.storeId }, select: { id: true, submittedName: true, receiptCode: true, status: true, expiresAt: true, stationRevision: true, businessDay: { select: { closedAt: true } } } });
  if (!request) notFound();
  const setting = await prisma.qrReceptionSetting.findUnique({ where: { storeId: staff.storeId }, select: { enabled: true, revision: true } });
  const available = request.status === "PENDING" && request.expiresAt > new Date() && !request.businessDay.closedAt && setting?.enabled && setting.revision === request.stationRevision;
  const { q } = await searchParams, query = normalizeCustomerSearchTerm(typeof q === "string" ? q : request.submittedName);
  const choices = query ? await searchCustomers(prisma, staff.storeId, query, { includeInactive: true, limit: 20 }) : [];
  return <div className="page-content qr-reception-admin"><header><h1>来店申請の確認</h1><Link href="/admin/reception-qr" prefetch={false} className="button button-secondary">確認待ち一覧へ</Link></header>
    <section className="panel qr-reception-card"><h2>申請されたお名前</h2><p className="qr-reception-name">{request.submittedName}</p><p>受付番号 <strong>{request.receiptCode}</strong></p><p>店内にいる本人の画面と照合してください。名前だけで同じ会員と判断しないでください。</p></section>
    {available ? <>
      <section className="panel qr-reception-card"><h2>1. 既存の名簿を確認</h2><form method="get" className="qr-reception-form"><label htmlFor="qr-customer-search">名前・呼び名・会員番号</label><input id="qr-customer-search" type="search" name="q" maxLength={100} defaultValue={query} /><button className="button button-secondary">名簿を検索する</button></form><p>{choices.length ? "検索結果から会員を選択してください（最大20件）。無効会員は選択できません。" : "該当する名簿はありません。別の呼び名でも検索してから、新規登録を選んでください。"}</p></section>
      <section className="panel qr-reception-card"><h2>2. 本人を確認して受付確定</h2><ReceptionReviewForm requestId={request.id} submittedName={request.submittedName} choices={choices.map(c => ({ id: c.id, customerCode: c.customerCode, internalName: c.internalName, isActive: c.isActive }))} /></section>
      <section className="panel qr-reception-card"><h2>本人を確認できない場合</h2><p>この操作では会員登録も来店受付も行いません。</p><RejectReceptionForm requestId={request.id} /></section>
    </> : <section className="panel qr-reception-card"><h2>この申請は受付確定できません</h2><p>処理済み・期限切れ・受付停止・営業終了のいずれかです。必要ならお客さんに現在のQRから再申請してもらってください。</p></section>}
  </div>;
}
