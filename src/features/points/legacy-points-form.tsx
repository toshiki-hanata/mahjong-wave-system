"use client";
import { useState } from "react";
import { DraftStatus, useUnsavedDraft } from "@/components/forms/draft-guard";
import { useRetryableActionState } from "@/components/forms/retryable-action";
import { saveLegacyPointsAction } from "@/app/admin/(protected)/customers/[id]/points/actions";
export function LegacyPointsForm({ customerId, balance, imported, requestKey }: { customerId: string; balance: number; imported: number | null; requestKey: string }) {
  const [state, action, pending] = useRetryableActionState(saveLegacyPointsAction.bind(null, customerId), {} as { message?: string });
  const [snapshot] = useState({ balance, imported, requestKey }), [amount, setAmount] = useState(imported?.toString() ?? ""), [reason, setReason] = useState(""), [source, setSource] = useState("VISUAL");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const dirty = Boolean(reason || amount !== (snapshot.imported?.toString() ?? "") || Object.values(checks).some(Boolean)), hydrated = useUnsavedDraft(dirty), locked = pending || !hydrated;
  return <form action={action} className="business-controls business-time-form"><DraftStatus dirty={dirty} pending={pending} /><input type="hidden" name="requestKey" value={snapshot.requestKey} /><input type="hidden" name="expectedBalance" value={snapshot.balance} /><input type="hidden" name="expectedImported" value={snapshot.imported ?? ""} />
    {snapshot.imported === null && <label>確認方法<select name="source" value={source} disabled={locked} onChange={e => { setSource(e.target.value); if (e.target.value === "NO_CARD") setAmount("0"); }}><option value="VISUAL">旧カードを目視で確認</option><option value="NO_CARD">旧カードのない新規会員（0pt確定）</option></select></label>}{snapshot.imported !== null && <input type="hidden" name="source" value="VISUAL" />}
    <label>{snapshot.imported === null ? "引き継ぐポイント数" : "正しい引継ぎポイント総数"}<input name="amount" type="number" inputMode="numeric" min={0} max={2147483647} required value={amount} onChange={e => setAmount(e.target.value)} readOnly={source === "NO_CARD"} disabled={locked} /></label>
    {snapshot.imported !== null && <p>元の引継ぎ {snapshot.imported}ptとの差分を追加記録します。その後の通常調整は書き換えません。</p>}
    <label>確認内容・理由<textarea name="reason" rows={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} disabled={locked} /></label>
    {Object.entries({ personConfirmed: "本人を確認した", rosterConfirmed: "対象の名簿と重複登録を確認した", cardConfirmed: source === "NO_CARD" ? "旧カードがない新規会員であることを確認した" : "旧カードの表示・訂正前後のポイントを確認した", duplicateChecked: snapshot.imported === null ? "このカードの移行が未実施であることを確認した（新規会員は対象外であることを確認）" : "別の名簿への移行と訂正履歴を確認した" }).map(([key, label]) => <label className="business-confirm" key={key}><input name={key} type="checkbox" required checked={Boolean(checks[key])} disabled={locked} onChange={e => setChecks({ ...checks, [key]: e.target.checked })} />{label}</label>)}
    <p className="business-warning">旧カードに固有番号がないため、別の名簿への重複移行は自動判定できません。店員が確認してください。</p><button className="button button-primary" disabled={locked}>{pending ? "記録中…" : snapshot.imported === null ? "確認して引継ぎを記録" : "訂正を別の履歴に記録"}</button>{state.message && <p role="alert">{state.message}</p>}
  </form>;
}
