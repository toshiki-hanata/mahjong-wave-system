"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { previewRosterAction } from "@/app/admin/(protected)/customers/reconcile/actions";
import { MAX_ROSTER_CHARACTERS, type RosterResult } from "./roster-reconciliation";
import type { RosterPreview } from "./roster-reconciliation-service";

const labels: Record<RosterResult["status"], string> = {
  candidate: "候補1件・店員確認が必要", ambiguous: "同名の会員が複数います", "not-found": "候補なし・登録済みか再確認",
  "unknown-code": "会員番号が見つかりません", "name-conflict": "会員番号と名前が一致しません", inactive: "無効の会員が候補です",
};

export function RosterReconciliationForm() {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [state, action, pending] = useActionState(previewRosterAction, {} as RosterPreview);
  const current = submittedText === text;
  return <>
    <section className="panel business-panel"><h2>1. 名前を貼り付ける</h2><p>1行に1人、200人まで。Excelは「名前」「会員番号（任意）」の順に2列をコピーできます。名前だけの1列でも使えます。電話番号・メール・ポイント残高は貼り付けないでください。</p>
      <form action={action} className="business-controls business-time-form" onSubmit={() => setSubmittedText(text)}>
        <label htmlFor="customer-roster">名簿の名前・会員番号</label><textarea id="customer-roster" name="roster" rows={8} maxLength={MAX_ROSTER_CHARACTERS} value={text} onChange={(event) => setText(event.target.value)} placeholder={"佐藤 太郎\tW0001\n鈴木 花子"} disabled={pending} autoComplete="off" spellCheck={false} />
        <button className="button button-primary" disabled={pending || !text.trim()}>{pending ? "照合中…" : "登録せずに照合する"}</button>
      </form>
    </section>
    {!pending && !current && state.results && <p role="status">入力が変わりました。もう一度照合してください。</p>}
    {!pending && current && state.message && <p className="business-error" role="alert">{state.message}</p>}
    {!pending && current && state.results && <section aria-label="名簿の照合結果"><h2>2. 候補を店員が確認する</h2><p role="status">{state.results.length}行を照合しました。まだ登録・統合していません。</p>
      {state.results.map((row) => <article className="panel business-panel" key={row.line}>
        <h3>名簿 {row.line}行目</h3><p><strong>{row.name}</strong>{row.customerCode && <> ／ {row.customerCode}</>}</p><p>{labels[row.status]}</p>
        {row.duplicateName && <p className="business-warning">貼り付けた名簿内に同じ名前があります。別人か重複かを確認してください。</p>}
        {row.duplicateCode && <p className="business-warning">貼り付けた名簿内で会員番号が重複しています。</p>}
        {row.candidates.map((customer) => <p key={customer.id}><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customer.id)}`} target="_blank" rel="noopener noreferrer">{customer.internalName} ／ {customer.customerCode} ／ {customer.isActive ? "有効" : "無効"} の詳細を開く</Link></p>)}
        {row.candidateCount > row.candidates.length && <p>候補{row.candidateCount}件のうち5件を表示しています。会員番号を追加するか、顧客管理で検索してください。</p>}
        {!row.candidateCount && <p>別の呼び名や会員番号でも検索し、未登録と確認してから通常の受付で登録してください。</p>}
      </article>)}
    </section>}
  </>;
}
