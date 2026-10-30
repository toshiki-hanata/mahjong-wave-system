"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { quickReceptionAction, type QuickReceptionState } from "@/app/admin/(protected)/visits/actions";
import { normalizeReceptionName } from "./reception-schemas";
import { CheckInButton } from "./visit-action-buttons";

export function QuickReceptionForm({ initialRequestId, initialName }: { initialRequestId: string; initialName: string }) {
  const [entry, setEntry] = useState({ requestId: initialRequestId, initialName });
  return <QuickReceptionEntry key={entry.requestId} {...entry} onNext={() => setEntry({ requestId: crypto.randomUUID(), initialName: "" })} />;
}

function QuickReceptionEntry({ requestId, initialName, onNext }: { requestId: string; initialName: string; onNext: () => void }) {
  const [state, action, pending] = useActionState(quickReceptionAction, {} as QuickReceptionState);
  const [name, setName] = useState(initialName);
  const [confirmed, setConfirmed] = useState(false);
  const candidates = state.submittedName === normalizeReceptionName(name) ? state.candidates : undefined;

  if (state.success) return <div className="quick-reception-success" role="status">
    <strong>{state.message}</strong>
    <p>{state.customer?.internalName} <span>会員番号 {state.customer?.customerCode}</span></p>
    <div className="reception-links"><Link className="button button-primary" href="/admin/tables">卓に配置する</Link><button className="button button-secondary" onClick={onNext}>次のお客さんを登録</button></div>
  </div>;

  return <div>
    <form action={action} className="quick-reception-form">
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor="quick-reception-name">新しいお客さんのお名前・呼び名</label>
      <p id="quick-reception-help">紙の名簿にいる方は、先に上の検索で登録済みか確認してください。会員番号は自動で発行し、公開設定はOFFで登録します。</p>
      <input id="quick-reception-name" name="internalName" required maxLength={120} autoComplete="off" value={name} onChange={(event) => { setName(event.target.value); setConfirmed(false); }} aria-describedby={`quick-reception-help${state.fieldError ? " quick-reception-error" : ""}`} aria-invalid={Boolean(state.fieldError)} />
      {state.fieldError && <p id="quick-reception-error" className="visit-action-error" role="alert">{state.fieldError}</p>}
      {state.message && <p className="visit-action-error" role="alert">{state.message}</p>}
      {candidates?.length ? <label className="reception-confirm"><input type="checkbox" name="confirmDifferentPerson" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />下の登録とは別のお客さんであることを確認しました</label> : null}
      <button className="button button-primary" type="submit" disabled={pending || !name.trim() || Boolean(candidates?.length && !confirmed)}>{pending ? "登録・受付中…" : "登録して来店受付"}</button>
    </form>
    {candidates?.length ? <section className="reception-candidates" aria-label="同じお名前の登録">
      <h3>すでに登録されているお客さん</h3>
      <p>同じ方なら新しく登録せず、こちらから受付してください。</p>
      {candidates.map((customer) => <article className="visit-customer-result" key={customer.id}>
        <div><strong>{customer.internalName}</strong><span>{customer.customerCode} · {customer.isActive ? "有効" : "無効"}</span></div>
        {customer.isActive ? <CheckInButton customerId={customer.id} /> : <Link className="button button-secondary" href={`/admin/customers/${customer.id}`}>顧客情報を確認</Link>}
      </article>)}
    </section> : null}
  </div>;
}
