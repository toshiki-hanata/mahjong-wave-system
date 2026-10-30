"use client";
import { useActionState } from "react";
import { adjustPointsAction, reversePointsAction, type PointFormState } from "@/app/admin/(protected)/customers/[id]/points/actions";

type Props = { customerId: string; balance: number; requestKey: string };
export function PointAdjustmentForm({ customerId, balance, requestKey }: Props) {
  const [state, action, pending] = useActionState(adjustPointsAction.bind(null, customerId), {} as PointFormState);
  return <form action={action} className="business-controls business-time-form">
    <input type="hidden" name="requestKey" value={requestKey} /><input type="hidden" name="expectedBalance" value={balance} />
    <label htmlFor="point-direction">操作</label><select id="point-direction" name="direction" disabled={pending}><option value="add">ポイントを追加</option><option value="subtract">ポイントを減算</option></select>
    <label htmlFor="point-amount">ポイント数</label><input id="point-amount" name="amount" type="number" inputMode="numeric" min={1} max={2147483647} step={1} required disabled={pending} />
    <label htmlFor="point-reason">調整理由</label><textarea id="point-reason" name="reason" rows={3} maxLength={500} required disabled={pending} />
    <button className="button button-primary" disabled={pending}>{pending ? "記録中…" : "理由を付けて調整を記録"}</button>
    {state.message && <p className="business-error" role="alert">{state.message}</p>}
  </form>;
}
export function PointReversalForm({ customerId, balance, requestKey, entryId }: Props & { entryId: string }) {
  const [state, action, pending] = useActionState(reversePointsAction.bind(null, customerId), {} as PointFormState);
  return <form action={action} className="business-controls business-time-form">
    <input type="hidden" name="requestKey" value={requestKey} /><input type="hidden" name="expectedBalance" value={balance} /><input type="hidden" name="entryId" value={entryId} />
    <label htmlFor={`point-reversal-${entryId}`}>取消理由</label><textarea id={`point-reversal-${entryId}`} name="reason" rows={2} required maxLength={500} disabled={pending} />
    <button className="button button-secondary" disabled={pending}>{pending ? "記録中…" : "この調整を取り消す"}</button>
    {state.message && <p className="business-error" role="alert">{state.message}</p>}
  </form>;
}
