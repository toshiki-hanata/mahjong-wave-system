import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { getPointLedgerData, PointPermissionError } from "@/features/points/point-ledger-service";
import { PointAdjustmentForm, PointReversalForm } from "@/features/points/point-ledger-form";

export default async function CustomerPointsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireStaff();
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  if (!id || id.length > 200) notFound();
  if (!prisma) return <div className="page-content business-page"><h1>会員のポイント</h1><p role="alert">データベースへ接続できません。</p></div>;
  let data;
  try { data = await getPointLedgerData(prisma, { storeId: actor.storeId, staffId: actor.id }, id); } catch (error) { if (error instanceof PointPermissionError) notFound(); throw error; }
  if (!data) notFound();
  const date = (value: Date) => new Intl.DateTimeFormat("ja-JP", { timeZone: actor.storeTimezone, dateStyle: "short", timeStyle: "short" }).format(value);
  return <div className="page-content business-page">
    <header className="business-heading"><p className="eyebrow">MEMBER POINTS</p><h1>会員のポイント</h1><p>{data.customer.internalName} ／ {data.customer.customerCode}{!data.customer.isActive && " ／ 無効会員・履歴のみ"}</p></header>
    <div className="business-links"><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(id)}`}>会員情報へ</Link><Link className="button button-secondary" href="/admin/customers">会員を検索する</Link></div>
    {(notice === "adjusted" || notice === "reversed") && <p className="business-success" role="status">{notice === "adjusted" ? "ポイントの調整を記録しました。" : "取消を別の履歴として記録しました。"}</p>}
    <section className="panel business-panel"><h2>記録済みポイント残高</h2><p><strong>{data.balance.toLocaleString("ja-JP")} pt</strong></p><p className="business-warning">旧LINEカードの残高はまだ移行していません。この残高には含まれません。旧残高の引継ぎは、確認手順が決まってから行います。</p><p>来店・対局による自動付与と特典交換は準備中です。この画面では責任者が理由を付けて調整を記録できます。</p></section>
    {data.canAdjust && data.customer.isActive && <details className="panel business-panel"><summary>責任者によるポイント調整</summary><p>追加・減算と理由を確認してください。旧カードの移行としては使わず、移行手続きの開始を待ってください。</p><PointAdjustmentForm customerId={id} balance={data.balance} requestKey={randomUUID()} /></details>}
    <section aria-label="ポイント履歴"><h2>ポイント履歴</h2><p>全{data.totalEntries}件のうち最新50件まで表示。記録は削除せず、取消も履歴に残します。</p>
      {!data.entries.length && <p>ポイントの記録はまだありません。</p>}
      {data.entries.map((entry) => <article className="panel business-panel" key={entry.id}>
        <h3>#{entry.sequenceNumber} {entry.kind === "ADJUST" ? "手動調整" : "調整の取消"}</h3><p>{date(entry.createdAt)} ／ 担当 {entry.actor.name}</p><p><strong>{entry.delta > 0 ? "+" : ""}{entry.delta.toLocaleString("ja-JP")} pt</strong> ／ 記録後 {entry.balanceAfter.toLocaleString("ja-JP")} pt</p><p className="business-time-reason">{entry.reason}</p>
        {entry.reversalEntries.length > 0 && <p>取消済み（元の記録を保持）</p>}
        {data.canAdjust && data.customer.isActive && entry.kind === "ADJUST" && !entry.reversalEntries.length && <details><summary>この調整を取り消す</summary><PointReversalForm customerId={id} entryId={entry.id} balance={data.balance} requestKey={randomUUID()} /></details>}
      </article>)}
    </section>
  </div>;
}
