"use client";
import { useActionState, useState } from "react";
import { acknowledgeMfaAction, recoverMfaAction, verifyMfaAction } from "./actions";

export function MfaCodeForm({ enrollment }: { enrollment: boolean }) {
  const [state, action, pending] = useActionState(verifyMfaAction, {});
  const [invitation, setInvitation] = useState("");
  const [code, setCode] = useState("");
  return <form action={action} className="login-form">
    {enrollment && <><label htmlFor="invitation">初回登録コード</label><input id="invitation" name="invitation" type="password" autoComplete="off" value={invitation} onChange={event => setInvitation(event.target.value)} required maxLength={43} /><small>管理者から別に受け取ったコードを入力してください。</small></>}
    <label htmlFor="code">認証アプリの6桁コード</label>
    <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={event => setCode(event.target.value)} required />
    <small>一度使ったコードは再利用できません。新しいコードが表示されるまでお待ちください。</small>
    {state.message && <p role="alert" className="login-error">{state.message}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "確認中…" : "追加認証を確認"}</button>
  </form>;
}
export function MfaRecoveryForm() {
  const [state, action, pending] = useActionState(recoverMfaAction, {});
  return <form action={action} className="login-form"><label htmlFor="recoveryCode">復旧コード</label><input id="recoveryCode" name="recoveryCode" type="password" autoComplete="off" maxLength={64} required />
    <small>1つ使うと旧認証アプリと全端末のログインが失効します。続けて新しい認証アプリを登録します。</small>
    {state.message && <p role="alert" className="login-error">{state.message}</p>}
    <button className="button button-secondary" disabled={pending}>{pending ? "確認中…" : "復旧して認証アプリを再登録"}</button></form>;
}
export function MfaAcknowledgeForm() {
  const [state, action, pending] = useActionState(acknowledgeMfaAction, {});
  return <form action={action} className="login-form"><label className="mfa-check"><input type="checkbox" name="saved" required />復旧コードを安全な場所に保管しました</label>
    {state.message && <p role="alert" className="login-error">{state.message}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "完了処理中…" : "保管を確認して管理画面へ"}</button></form>;
}
