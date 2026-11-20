"use client";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { submitQrReceptionAction } from "@/app/reception/[storeId]/actions";
import { approveQrReceptionAction, rejectQrReceptionAction, updateQrReceptionAction } from "@/app/admin/(protected)/reception-qr/actions";

const subscribe = () => () => {};
const ready = () => true;
const pendingHydration = () => false;
export function ReceptionRefresh({ waiting = false }: { waiting?: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!waiting) return; const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 5000); return () => clearInterval(timer); }, [router, waiting]);
  return <button className="button button-secondary" type="button" onClick={() => router.refresh()}>最新の状態を確認</button>;
}
export function ReceptionSubmitForm({ storeId, qrKey, token }: { storeId: string; qrKey: string; token: string }) {
  const hydrated = useSyncExternalStore(subscribe, ready, pendingHydration);
  const [state, action, pending] = useActionState(submitQrReceptionAction.bind(null, storeId, qrKey), {});
  const [requestToken] = useState(token), [name, setName] = useState("");
  return <form action={action} className="qr-reception-form">
    <input type="hidden" name="token" value={requestToken} />
    <label htmlFor="reception-name">お名前・呼び名</label>
    <input id="reception-name" name="name" value={name} onChange={e => setName(e.target.value)} disabled={pending || !hydrated} required maxLength={120} autoComplete="name" placeholder="店員に伝わるお名前" />
    <p>送信後、受付番号を店員に見せてください。店員の確認で来店受付が完了します。</p>
    {state.message && <p role="alert" className="qr-reception-error">{state.message}</p>}
    <button className="button button-primary" disabled={pending || !hydrated}>{pending ? "送信中…" : "来店を申請する"}</button>
  </form>;
}
export function ReceptionSettingForm({ mode, children }: { mode: "enable" | "disable" | "rotate"; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(updateQrReceptionAction, {});
  return <form action={action}><input type="hidden" name="mode" value={mode} /><button className={`button ${mode === "enable" ? "button-primary" : "button-secondary"}`} disabled={pending}>{pending ? "変更中…" : children}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}
type CustomerChoice = { id: string; customerCode: string; internalName: string; isActive: boolean };
export function ReceptionReviewForm({ requestId, submittedName, choices }: { requestId: string; submittedName: string; choices: CustomerChoice[] }) {
  const hydrated = useSyncExternalStore(subscribe, ready, pendingHydration);
  const [choice, setChoice] = useState(""), [newName, setName] = useState(submittedName);
  const [state, action, pending] = useActionState(approveQrReceptionAction, {});
  const isNew = choice === "new";
  return <form action={action} className="qr-reception-form">
    <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="mode" value={isNew ? "new" : "existing"} />
    <label htmlFor="reception-customer">受付する会員</label>
    <select id="reception-customer" name="customerId" required value={choice} onChange={e => setChoice(e.target.value)} disabled={pending || !hydrated}>
      <option value="">既存会員か新規登録かを選択</option>
      {choices.map(c => <option key={c.id} value={c.id} disabled={!c.isActive}>{c.internalName} ／ {c.customerCode}{!c.isActive ? "（無効）" : ""}</option>)}
      <option value="new">新しい会員として登録する</option>
    </select>
    {isNew && <><label htmlFor="reception-new-name">名簿に登録するお名前</label><input id="reception-new-name" name="newName" value={newName} onChange={e => setName(e.target.value)} required maxLength={120} disabled={pending} /><label className="qr-reception-check"><input type="checkbox" name="differentPersonConfirmed" required disabled={pending} />既存の名簿と重複しないこと・同名なら別の方であることを確認しました</label></>}
    <label className="qr-reception-check"><input type="checkbox" name="personConfirmed" required disabled={pending || !hydrated} />店内にいる本人と、お名前・受付番号・会員情報を確認しました</label>
    {state.message && <p className="qr-reception-error" role="alert">{state.message}</p>}
    <button className="button button-primary" disabled={pending || !hydrated || !choice}>{pending ? "受付中…" : "確認して来店受付を確定"}</button>
  </form>;
}
export function RejectReceptionForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(rejectQrReceptionAction, {});
  return <form action={action}><input type="hidden" name="requestId" value={requestId} /><button className="button button-secondary" disabled={pending}>{pending ? "処理中…" : "この申請を見送る"}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}
export function PrintReceptionQr() { return <button type="button" className="button button-secondary qr-no-print" onClick={() => window.print()}>受付QRを印刷</button>; }
