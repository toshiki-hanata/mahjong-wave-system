"use client";

import { useActionState, useState } from "react";
import type { TableActionState } from "@/app/admin/(protected)/tables/actions";
import { createTableAction, deactivateTableAction, endTableSessionAction, startTableSessionAction, updateTableAction } from "@/app/admin/(protected)/tables/actions";

const initial: TableActionState = {};
type WaitingVisit = { id: string; checkedInAt: string; customer: { customerCode: string; internalName: string } };
type Seat = { position: number; visitId: string; visit: { status: string; customer: { customerCode: string; internalName: string; isActive: boolean } } };
type TableData = { id: string; name: string; sortOrder: number; isActive: boolean; sessions: { id: string; startedAt: string | Date; seats: Seat[] }[] };

function ActionNotice({ state }: { state: TableActionState }) {
  if (!state.message) return null;
  return <p className={`table-action-notice${state.success ? " is-success" : ""}`} role="status">{state.message}</p>;
}

export function CreateTableForm() {
  const [state, action, pending] = useActionState(createTableAction, initial);
  return <form action={action} className="table-master-create">
    <label>卓名<input name="name" required maxLength={40} placeholder="例: A卓" /></label>
    <label>表示順<input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} /></label>
    <button className="button button-primary" disabled={pending}>{pending ? "追加中…" : "卓を追加"}</button>
    <ActionNotice state={state} />
  </form>;
}

export function TableMasterForm({ table }: { table: TableData }) {
  const [state, action, pending] = useActionState(updateTableAction, initial);
  return <form action={action} className="table-master-edit">
    <input type="hidden" name="tableId" value={table.id} />
    <label>卓名<input name="name" required maxLength={40} defaultValue={table.name} /></label>
    <label>表示順<input name="sortOrder" type="number" min={0} max={10000} defaultValue={table.sortOrder} /></label>
    <button className="button button-secondary" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
    <ActionNotice state={state} />
  </form>;
}

export function DeactivateTableForm({ tableId }: { tableId: string }) {
  const [state, action, pending] = useActionState(deactivateTableAction, initial);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("この卓を無効化しますか？過去のSession履歴は残ります。")) event.preventDefault(); }}>
    <input type="hidden" name="tableId" value={tableId} />
    <button className="button button-danger" disabled={pending}>{pending ? "処理中…" : "卓を無効化"}</button>
    <ActionNotice state={state} />
  </form>;
}

export function StartTableForm({ tableId, waitingVisits }: { tableId: string; waitingVisits: WaitingVisit[] }) {
  const [state, action, pending] = useActionState(startTableSessionAction, initial);
  const [visitIds, setVisitIds] = useState(["", "", "", ""]);
  const complete = visitIds.every(Boolean) && new Set(visitIds).size === 4;
  return <form action={action} className="table-start-form">
    <input type="hidden" name="tableId" value={tableId} />
    <div className="table-seat-picker">{[1, 2, 3, 4].map((position) => <label key={position}><span>物理位置 {position}</span>
      <select name={`visitId${position}`} required value={visitIds[position - 1]} onChange={(event) => setVisitIds((current) => current.map((id, index) => index === position - 1 ? event.target.value : id))}>
        <option value="">顧客を選択</option>
        {waitingVisits.map((visit) => <option key={visit.id} value={visit.id}>{visit.customer.internalName} · {visit.customer.customerCode}</option>)}
      </select>
    </label>)}</div>
    <button className="button button-primary table-start-button" disabled={pending || !complete || waitingVisits.length < 4}>{pending ? "開始中…" : "4人で卓を開始"}</button>
    {waitingVisits.length < 4 && <p className="table-help">開始には待機中の顧客が4人必要です。</p>}
    <ActionNotice state={state} />
  </form>;
}

export function EndTableForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(endTableSessionAction, initial);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("卓を解放し、4人全員を待機中へ戻しますか？")) event.preventDefault(); }}>
    <input type="hidden" name="sessionId" value={sessionId} />
    <button className="button button-secondary table-end-button" disabled={pending}>{pending ? "解放中…" : "4人を待機へ戻して卓を解放"}</button>
    <ActionNotice state={state} />
  </form>;
}
