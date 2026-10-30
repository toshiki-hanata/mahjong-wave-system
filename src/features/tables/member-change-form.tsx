"use client";
import { useActionState, useState } from "react";
import { changeTableMembersAction, type TableActionState } from "@/app/admin/(protected)/tables/actions";

type Person = { id: string; customer: { internalName: string; customerCode: string } };

export function MemberChangeForm({ sessionId, requestKey, seatingToken, expectedSequence, seats, waitingVisits }: {
  sessionId: string; requestKey: string; seatingToken: string; expectedSequence: number;
  seats: Array<{ position: number; name: string }>;
  waitingVisits: Person[];
}) {
  const [key] = useState(requestKey);
  const [mode, setMode] = useState<"replace" | "swap">("replace");
  const [position, setPosition] = useState("1");
  const [otherPosition, setOtherPosition] = useState("2");
  const [incoming, setIncoming] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(changeTableMembersAction, {} as TableActionState);
  return <form action={action} className="member-change-form">
    <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="requestKey" value={key} /><input type="hidden" name="seatingToken" value={seatingToken} /><input type="hidden" name="expectedSequence" value={expectedSequence} />
    <p>半荘の間に変更してください。前の対局記録は残り、次の半荘から新しい席で入力できます。</p>
    <label>変更内容<select name="mode" value={mode} onChange={(event) => { setMode(event.target.value as "replace" | "swap"); setConfirmed(false); }} disabled={pending}><option value="replace">1人を待機客と交代</option><option value="swap">座席を入れ替える</option></select></label>
    <label>{mode === "replace" ? "待機へ戻るお客さん" : "入れ替える座席"}<select name="position" value={position} onChange={(event) => { setPosition(event.target.value); setConfirmed(false); }} disabled={pending}>{seats.map((seat) => <option key={seat.position} value={seat.position}>座席{seat.position} · {seat.name}</option>)}</select></label>
    {mode === "replace" ? <label>次に入るお客さん<select name="incomingVisitId" value={incoming} onChange={(event) => { setIncoming(event.target.value); setConfirmed(false); }} required disabled={pending}><option value="">待機客から選択</option>{waitingVisits.map((visit) => <option key={visit.id} value={visit.id}>{visit.customer.internalName} · {visit.customer.customerCode}</option>)}</select></label> : <label>相手の座席<select name="otherPosition" value={otherPosition} onChange={(event) => { setOtherPosition(event.target.value); setConfirmed(false); }} disabled={pending}>{seats.map((seat) => <option key={seat.position} value={seat.position} disabled={String(seat.position) === position}>座席{seat.position} · {seat.name}</option>)}</select></label>}
    {mode === "replace" && !waitingVisits.length && <p>交代できる待機客がいません。先に来店受付をしてください。</p>}
    <label className="member-confirm"><input name="confirmed" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} />前の半荘結果が入力済み、または対局開始前であることを確認しました</label>
    <button className="button button-secondary" disabled={pending || !confirmed || (mode === "replace" ? !incoming : position === otherPosition)}>{pending ? "変更中…" : mode === "replace" ? "1人を交代する" : "座席を入れ替える"}</button>
    {state.message && <p className={state.success ? "table-change-success" : "table-change-error"} role={state.success ? "status" : "alert"}>{state.message}</p>}
  </form>;
}
