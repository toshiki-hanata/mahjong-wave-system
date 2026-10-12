"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return <form className="login-form" action={formAction}>
    <label htmlFor="loginId">ログインID</label>
    <input id="loginId" name="loginId" type="text" autoComplete="username" required maxLength={120} />
    {state.fieldErrors?.loginId?.map((error) => <small className="field-error" key={error}>{error}</small>)}
    <label htmlFor="password">パスワード</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required />
    {state.fieldErrors?.password?.map((error) => <small className="field-error" key={error}>{error}</small>)}
    {state.message && <p className="login-error" role="alert">{state.message}</p>}
    <button className="button button-primary login-submit" type="submit" disabled={pending}>{pending ? "確認中..." : "ログイン"}</button>
  </form>;
}
