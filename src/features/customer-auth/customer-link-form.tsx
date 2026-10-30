"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { claimPairingAction, confirmPairingAction, readPairingAction } from "@/app/member/link/actions";
import type { CustomerLinkState } from "./pairing-service";

export function CustomerLinkForm() {
  const started = useRef(false);
  const [state, setState] = useState<CustomerLinkState | null>(null), [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const shouldPoll = state?.state === "CONFIRM" || state?.state === "READY";
  useEffect(() => {
    // Cookie-setting Server Action responses can restore the router's original URL.
    // Remove the QR fragment after that response has committed, as well as on first mount.
    if (state) window.history.replaceState(null, "", window.location.pathname);
  }, [state]);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    startTransition(async () => { setState(await (token ? claimPairingAction(token) : readPairingAction())); });
  }, []);
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => startTransition(async () => { setState(await readPairingAction()); }), 3000);
    return () => window.clearInterval(timer);
  }, [shouldPoll]);
  if (!state) return <p role="status">スマホ連携を確認しています…</p>;
  if (state.state === "INVALID") return <section className="panel business-panel"><h2>連携を確認できません</h2><p>期限切れ・取消済み、または別の端末で読み取られた可能性があります。店員に新しいQRの発行を依頼してください。</p></section>;
  return <section className="panel business-panel">
    <h2>店員と確認番号を照合してください</h2><p className="business-badge"><strong>{state.confirmationCode}</strong></p>
    <p>店員の画面と同じ番号が表示されていること、お客さまご自身の会員へ連携することを確認してください。</p>
    {state.state === "READY" ? <><p className="business-success" role="status">双方の確認が済みました。まだパスキー登録は完了していません。</p><p>パスキー登録の準備中です。店員の案内をお待ちください。</p></> : <>
      <p>{state.staffConfirmed ? "店員の確認：済み" : "店員の確認を待っています"}</p>
      {state.customerConfirmed ? <p role="status">お客さまの確認：済み</p> : <div className="business-controls"><label className="business-confirm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={pending} />店員と番号が一致し、自分の会員であることを確認しました</label><button className="button button-primary" disabled={pending || !checked} onClick={() => startTransition(async () => { setState(await confirmPairingAction()); })}>{pending ? "確認中…" : "確認しました"}</button></div>}
    </>}
    <p>この確認だけでは来店受付・ポイント利用・マイページのログインは行われません。</p>
  </section>;
}
