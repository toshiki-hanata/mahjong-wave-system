"use client";
import { useState } from "react";
import { DraftStatus, useUnsavedDraft } from "@/components/forms/draft-guard";
import { useRetryableActionState } from "@/components/forms/retryable-action";
import { adjustPointsAction, reversePointsAction, type PointFormState } from "@/app/admin/(protected)/customers/[id]/points/actions";
type Props = { customerId: string; balance: number; requestKey: string };
export function PointAdjustmentForm({ customerId, balance, requestKey }: Props) {
  const [state, action, pending] = useRetryableActionState(adjustPointsAction.bind(null, customerId), {} as PointFormState);
  const [key] = useState(requestKey), [expectedBalance] = useState(balance);
  const [amount, setAmount] = useState(""), [reason, setReason] = useState(""), [direction, setDirection] = useState("add");
  const dirty = Boolean(amount || reason) || direction !== "add", hydrated = useUnsavedDraft(dirty), locked = pending || !hydrated;
  return <form action={action} className="business-controls business-time-form"><DraftStatus dirty={dirty} pending={pending} />
    <input type="hidden" name="requestKey" value={key} /><input type="hidden" name="expectedBalance" value={expectedBalance} />
    <label htmlFor="point-direction">操作</label><select id="point-direction" name="direction" value={direction} onChange={e => setDirection(e.target.value)} disabled={locked}><option value="add">ポイントを追加</option><option value="subtract">ポイントを減算</option></select>
    <label htmlFor="point-amount">ポイント数</label><input id="point-amount" name="amount" type="number" inputMode="numeric" min={1} max={2147483647} step={1} required value={amount} onChange={e => setAmount(e.target.value)} disabled={locked} />
    <label htmlFor="point-reason">調整理由</label><textarea id="point-reason" name="reason" rows={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} disabled={locked} />
    <button className="button button-primary" disabled={locked}>{pending ? "記録中…" : "理由を付けて調整を記録"}</button>
    {state.message && <p className="business-error" role="alert">{state.message}</p>}
  </form>;
}
export function PointReversalForm({ customerId, balance, requestKey, entryId }: Props & { entryId: string }) {
  const [state, action, pending] = useRetryableActionState(reversePointsAction.bind(null, customerId), {} as PointFormState);
  const [key] = useState(requestKey), [expectedBalance] = useState(balance), [reason, setReason] = useState("");
  const dirty = Boolean(reason), hydrated = useUnsavedDraft(dirty), locked = pending || !hydrated;
  return <form action={action} className="business-controls business-time-form"><DraftStatus dirty={dirty} pending={pending} />
    <input type="hidden" name="requestKey" value={key} /><input type="hidden" name="expectedBalance" value={expectedBalance} /><input type="hidden" name="entryId" value={entryId} />
    <label htmlFor={`point-reversal-${entryId}`}>取消理由</label><textarea id={`point-reversal-${entryId}`} name="reason" rows={2} required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={locked} />
    <button className="button button-secondary" disabled={locked}>{pending ? "記録中…" : "この調整を取り消す"}</button>
    {state.message && <p className="business-error" role="alert">{state.message}</p>}
  </form>;
}
