import Image from "next/image";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";
import { getMfaChallengeView } from "@/lib/auth/mfa/service";
import { readMfaPendingToken } from "@/lib/auth/mfa/pending-cookie";
import { totpUri } from "@/lib/auth/mfa/crypto";
import { cancelMfaAction } from "./actions";
import { MfaAcknowledgeForm, MfaCodeForm, MfaRecoveryForm } from "./mfa-forms";
import { MfaDeadline } from "./deadline";

export const dynamic = "force-dynamic";
export default async function StaffMfaPage() {
  const token = await readMfaPendingToken();
  if (!token || !prisma) redirect("/admin/login?reason=mfa-expired");
  await assertRuntimeDatabaseRole(prisma);
  const view = await getMfaChallengeView(prisma, token);
  if (!view) redirect("/admin/login?reason=mfa-expired");
  const qr = view.secret ? await QRCode.toDataURL(totpUri(view.secret, view.label), { width: 208, margin: 2 }) : null;
  return <main className="login-page"><section className="login-card mfa-card">
    <div className="login-heading"><p className="eyebrow">ACCOUNT SECURITY</p><h1>{view.kind === "ACKNOWLEDGE" ? "復旧コードを保管" : view.secret ? "認証アプリを登録" : "追加認証"}</h1>
      <p>OWNER／MANAGERは追加認証が必要です。</p></div>
    <MfaDeadline expiresAt={view.expiresAt} />
    {view.kind === "ACKNOWLEDGE" ? <>
      <p>次の10個は、それぞれ一度だけ使えます。新しい一覧の発行により以前の復旧コードは失効しました。</p>
      <p className="login-error">認証アプリを失っても使えるよう、別の安全な場所に保管してください。この画面は5分で失効します。</p>
      <ul className="mfa-codes" aria-label="使い捨て復旧コード">{view.recoveryCodes?.map(code => <li key={code}><code>{code}</code></li>)}</ul>
      <MfaAcknowledgeForm />
    </> : <>
      {view.secret && qr && <div className="mfa-setup"><p>認証アプリでQRを読み取ってください。同じスマホで操作中は、下の設定キーをアプリへ手入力できます。</p>
        <Image src={qr} width={208} height={208} unoptimized alt="認証アプリ登録用QRコード" />
        <details><summary>設定キーを表示</summary><p>アカウント：{view.label}／時間ベース・6桁・30秒</p><code className="mfa-secret">{view.secret}</code><p>このキーやQRを他の人に共有しないでください。</p></details></div>}
      {view.recoveryRequired ? <p role="status">旧認証アプリは失効しています。別の未使用の復旧コードで再登録を続けてください。</p> : <MfaCodeForm enrollment={view.kind === "ENROLL"} />}
      {view.kind === "VERIFY" && <details className="mfa-recovery"><summary>認証アプリを使えない場合</summary><MfaRecoveryForm /></details>}
    </>}
    <form action={cancelMfaAction}><button className="button button-secondary mfa-cancel">中止してログイン画面へ</button></form>
  </section></main>;
}
