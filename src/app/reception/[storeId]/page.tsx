import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";
import { qrReceptionEnabled, storeIdSchema, createReceptionToken, receptionCookieName } from "@/features/qr-reception/policy";
import { publicReceptionView } from "@/features/qr-reception/queries";
import { ReceptionRefresh, ReceptionSubmitForm } from "@/features/qr-reception/controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "来店受付 | 麻雀ウェーブ", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReceptionPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ key?: string }> }) {
  if (!qrReceptionEnabled() || !prisma) notFound();
  const { storeId } = await params, { key } = await searchParams;
  if (!storeIdSchema.safeParse(storeId).success || typeof key !== "string" || key.length > 90) notFound();
  await assertRuntimeDatabaseRole(prisma);
  const secret = process.env.SESSION_SECRET ?? "", receipt = (await cookies()).get(receptionCookieName(storeId))?.value;
  const view = await publicReceptionView(prisma, storeId, key, secret, receipt);
  if (!view) return <main className="qr-reception-public"><section className="panel qr-reception-card"><h1>この受付QRは利用できません</h1><p>店員にお声がけいただくか、店内の新しいQRを読み取ってください。</p></section></main>;
  const message = { PENDING: "店員の確認待ちです", APPROVED: "来店受付が完了しました", REJECTED: "店員にお声がけください", EXPIRED: "申請の有効期限が切れました" };
  return <main className="qr-reception-public"><section className="panel qr-reception-card">
    <p className="eyebrow">麻雀ウェーブ</p><h1>{view.storeName}の来店受付</h1>
    {!view.open && <p className="qr-reception-notice" role="status">現在は受付していません。店員にお声がけください。</p>}
    {view.receipt && <section className="qr-reception-receipt" aria-label="あなたの受付申請"><h2>{message[view.receipt.state!]}</h2><p>受付番号</p><strong>{view.receipt.code}</strong>{view.receipt.state === "PENDING" && <p>この番号を店員に見せてください。まだ来店受付は確定していません。</p>}<ReceptionRefresh waiting={view.open && view.receipt.state === "PENDING"} /></section>}
    {view.canSubmit && <><h2>{view.receipt ? "もう一度来店を申請" : "お名前をお知らせください"}</h2><ReceptionSubmitForm key={view.receipt?.code ?? "first"} storeId={storeId} qrKey={key} token={createReceptionToken(storeId, key, secret)} /></>}
    <p className="qr-reception-help">初めての方も登録済みの方も、店員が名簿を確認します。スマホを使わない受付もできます。</p>
  </section></main>;
}
