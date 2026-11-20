import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { visitOperationRoles } from "@/features/visits/visit-permissions";
import { qrReceptionEnabled, receptionOrigin, receptionUrl } from "@/features/qr-reception/policy";
import { staffReceptionQueue } from "@/features/qr-reception/queries";
import { ReceptionSettingForm, ReceptionRefresh, PrintReceptionQr } from "@/features/qr-reception/controls";

export const dynamic = "force-dynamic";
export default async function ReceptionQrPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const staff = await requireRole(visitOperationRoles);
  if (!qrReceptionEnabled()) notFound();
  if (!prisma) return <div className="page-content"><h1>QR受付</h1><p>データベースを確認してください。</p></div>;
  const data = await staffReceptionQueue(prisma, staff.storeId), { notice } = await searchParams;
  const url = data.setting?.enabled ? receptionUrl(staff.storeId, data.setting.revision, process.env.SESSION_SECRET ?? "", receptionOrigin()) : null;
  const qr = url ? await QRCode.toDataURL(url, { width: 320, margin: 2 }) : null;
  return <div className="page-content qr-reception-admin">
    <header className="qr-no-print"><p className="eyebrow">来店受付</p><h1>店内QR・受付申請</h1><p>お客さんの申請を確認し、既存名簿と照合して来店を確定します。</p><Link href="/admin/visits" prefetch={false} className="button button-secondary">受付・来店中へ戻る</Link></header>
    {notice === "approved" && <p className="qr-reception-notice qr-no-print" role="status">来店受付を確定しました。すでに来店中の方は二重受付していません。</p>}
    {notice === "rejected" && <p className="qr-reception-notice qr-no-print" role="status">申請を見送りました。</p>}
    <section className="panel qr-reception-card qr-reception-poster">
      <h2>{staff.storeName}の来店受付</h2>
      {url && qr ? <><p>お客さん自身のスマホで読み取ってください</p><Image src={qr} width={320} height={320} alt="お客さん用の来店受付QR" unoptimized /><p>お名前を送信し、表示された受付番号を店員へ見せてください。</p><p>店員の確認で来店受付が完了します。</p><a href={url} target="_blank" rel="noreferrer" className="button button-secondary qr-no-print">お客さんの受付画面を開く</a><div className="qr-reception-buttons qr-no-print"><PrintReceptionQr /><ReceptionSettingForm mode="rotate">QRを再発行する</ReceptionSettingForm><ReceptionSettingForm mode="disable">QR受付を停止する</ReceptionSettingForm></div><p className="qr-no-print">再発行・停止すると以前のQRは使えなくなります。再発行後は掲示も差し替えてください。</p></> : <><p>店内に掲示するQRを用意します。スマホからの申請だけでは、会員登録・来店受付は確定しません。</p><ReceptionSettingForm mode="enable">QR受付を有効にする</ReceptionSettingForm></>}
      {!data.open && <p className="qr-reception-notice qr-no-print">営業開始後に申請を受け付けます。QRを用意しても営業は自動で始まりません。</p>}
    </section>
    <section className="panel qr-reception-card qr-no-print"><div className="qr-reception-heading"><h2>店員の確認待ち {data.requests.length}件</h2><ReceptionRefresh waiting={data.open && Boolean(data.setting?.enabled)} /></div><p>店内の本人と、お名前・受付番号を照合してください。申請は30分で失効し、営業終了・QR再発行後の申請は受付確定できません。</p>
      {data.requests.length ? <ul className="qr-reception-queue">{data.requests.map(r => <li key={r.id}><div><strong>{r.submittedName}</strong><span>受付番号 {r.receiptCode}</span></div><Link href={`/admin/reception-qr/${r.id}`} prefetch={false} className="button button-primary">本人・名簿を確認</Link></li>)}</ul> : <p>確認待ちの申請はありません。</p>}
    </section>
  </div>;
}
