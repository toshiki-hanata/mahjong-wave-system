"use client";
import { useActionState, useState } from "react";
import { checkInStaffParticipantAction, type StaffParticipationState } from "@/app/admin/(protected)/staff-games/actions";

export function StaffParticipationForm({ staff, requestKey }: { staff: Array<{ id: string; name: string; alreadyParticipating: boolean }>; requestKey: string }) {
  const [key] = useState(requestKey);
  const [selected, setSelected] = useState("");
  const [state, action, pending] = useActionState(checkInStaffParticipantAction, {} as StaffParticipationState);
  return <form action={action} className="business-controls">
    <input type="hidden" name="requestKey" value={key} />
    <label htmlFor="staff-participant-select">参加するスタッフ</label>
    <select id="staff-participant-select" name="participantStaffId" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={pending} required>
      <option value="">スタッフを選択</option>
      {staff.map((person) => <option key={person.id} value={person.id} disabled={person.alreadyParticipating}>{person.name}{person.alreadyParticipating ? "（参加中）" : ""}</option>)}
    </select>
    <button className="button button-primary" disabled={pending || !selected}>{pending ? "追加中…" : "スタッフを待機に追加"}</button>
    {state.message && <p className="business-error" role="alert">{state.message}</p>}
  </form>;
}
