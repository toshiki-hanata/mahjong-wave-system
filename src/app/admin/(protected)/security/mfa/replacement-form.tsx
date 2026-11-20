"use client";
import { useActionState } from "react";
import { replaceStaffMfaAction } from "./actions";
export function MfaReplacementForm() {
  const [state, action, pending] = useActionState(replaceStaffMfaAction, {});
  return <form action={action} className="login-form"><label htmlFor="password">現在のパスワード</label><input id="password" name="password" type="password" autoComplete="current-password" required />
    <label htmlFor="code">現在の認証アプリの6桁コード</label><input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
    <p>再設定を始めると全端末のログインが失効します。新しいアプリの登録後、復旧コードもすべて入れ替わります。</p>
    {state.message && <p className="login-error" role="alert">{state.message}</p>}
    <button className="button button-primary" disabled={pending}>{pending ? "確認中…" : "認証アプリ・復旧コードを再設定"}</button></form>;
}
