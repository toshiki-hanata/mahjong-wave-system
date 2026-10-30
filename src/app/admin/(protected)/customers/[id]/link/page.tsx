import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { getCustomerAuthConfig } from "@/features/customer-auth/auth-config";
import { getStaffPairingData } from "@/features/customer-auth/pairing-service";
import { IssuePairingForm, ConfirmStaffLinkForm, CancelStaffLinkForm, PairingRefresh } from "@/features/customer-auth/staff-pairing-form";

export default async function CustomerLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff(), { id } = await params, settings = getCustomerAuthConfig();
  if (!id || id.length > 200) notFound();
  if (!settings || !prisma) return <div className="page-content business-page"><h1>スマホ連携</h1><p>顧客向けのスマホ連携は準備中です。通常の店員受付をご利用ください。</p></div>;
  const data = await getStaffPairingData(prisma, id, { storeId: actor.storeId, staffId: actor.id });
  if (!data) notFound();
  const active = data.customer.isActive && !data.customer.authIdentity?.activatedAt;
  const pairing = data.pairing;
  return <div className="page-content business-page"><PairingRefresh />
    <header className="business-heading"><p className="eyebrow">MEMBER PHONE LINK</p><h1>会員のスマホ連携</h1><p>{data.customer.internalName} ／ {data.customer.customerCode}</p></header>
    <div className="business-links"><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(id)}`}>会員情報へ</Link></div>
    {settings.rpId === "localhost" && <p className="business-warning">現在はPCのlocalhostでの開発検証用です。実際のスマホで使う前に、認証用のHTTPSアドレスを設定してください。</p>}
    <p>既存の会員で間違いないか確認してください。番号照合の後、パスキー登録の成功まで確認します。</p>
    {!active ? <p>{data.customer.authIdentity?.activatedAt ? "この会員は初回連携済みです。新しい初回QRで認証を置き換えられません。既存パスキーまたは復旧コードで再認証してください。" : "無効会員のため連携できません。"}</p> : <>
      <section className="panel business-panel"><h2>1. お客さんに連携QRを読み取ってもらう</h2><IssuePairingForm customerId={id} initialKey={randomUUID()} activePairingId={pairing?.usable ? pairing.id : undefined} /></section>
      {pairing?.usable && <section className="panel business-panel"><h2>2. 対象会員と確認番号を照合する</h2>{pairing.claimed ? <><p>お客さんの画面と同じ番号か確認してください。</p><p className="business-badge"><strong>{pairing.state.confirmationCode}</strong></p><p>お客さんの確認：{pairing.state.customerConfirmed ? "済み" : "待ち"}</p>{pairing.state.staffConfirmed ? <p>店員の確認：済み。パスキー登録完了前は未連携です。</p> : <ConfirmStaffLinkForm customerId={id} pairingId={pairing.id} />}</> : <p>QRが読み取られるのを待っています。</p>}<CancelStaffLinkForm customerId={id} pairingId={pairing.id} /></section>}
    </>}
  </div>;
}
