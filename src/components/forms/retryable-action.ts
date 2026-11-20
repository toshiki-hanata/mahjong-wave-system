"use client";
import { useActionState, useCallback } from "react";
type State = { message?: string; success?: boolean };
export async function runRetryableFormAction<S extends State>(action: (state: S, form: FormData) => Promise<S>, previous: S, form: FormData): Promise<S> {
  try { return await action(previous, form); }
  catch (error) {
    // Keep framework navigation/authorization redirects intact.
    if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK);/.test(error.digest)) throw error;
    return { ...previous, success: false, message: "通信・保存を確認できませんでした。入力は残っています。接続を確認して、同じ内容で再度保存してください。" };
  }
}
export function useRetryableActionState<S extends State>(action: (state: S, form: FormData) => Promise<S>, initial: S) {
  const retryable = useCallback((previous: S, form: FormData) => runRetryableFormAction(action, previous, form), [action]);
  return useActionState<S, FormData>(retryable, initial as Awaited<S>);
}
