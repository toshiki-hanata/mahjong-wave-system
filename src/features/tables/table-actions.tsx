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
  const [query, setQuery] = useState("");
  const complete = visitIds.every((id) => waitingVisits.some((visit) => visit.id === id)) && new Set(visitIds).size === 4;
  const candidates = waitingVisits.filter((visit) => !visitIds.includes(visit.id) && `${visit.customer.internalName} ${visit.customer.customerCode}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <form action={action} className="table-start-form">
    <input type="hidden" name="tableId" value={tableId} />
    <p className="table-help">待機中のお客さんをタップすると、座席1から順に入ります。変更する場合は選択した名前を外してください。</p>
    <div className="table-selected-seats">{[1, 2, 3, 4].map((position) => {
      const visit = waitingVisits.find((item) => item.id === visitIds[position - 1]);
      return <div key={position}><input type="hidden" name={`visitId${position}`} value={visitIds[position - 1]} /><span>座席 {position}</span><strong>{visit?.customer.internalName ?? (visitIds[position - 1] ? "状態が変わりました" : "未選択")}</strong>{visit && <small>{visit.customer.customerCode}</small>}{visitIds[position - 1] && <button type="button" disabled={pending} onClick={() => setVisitIds((current) => current.map((id, index) => index === position - 1 ? "" : id))} aria-label={`座席${position}の選択を外す`}>外す</button>}</div>;
    })}</div>
    <label className="table-waiting-search">待機客を探す<input type="search" value={query} disabled={pending} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="名前・会員番号" /></label>
    <div className="table-waiting-picker" aria-label="選択できる待機客">{candidates.map((visit) => <button type="button" key={visit.id} disabled={pending || visitIds.every(Boolean)} onClick={() => { setVisitIds((current) => { const next = [...current]; const empty = next.indexOf(""); if (empty >= 0) next[empty] = visit.id; return next; }); setQuery(""); }}><strong>{visit.customer.internalName}</strong><small>{visit.customer.customerCode}</small></button>)}</div>
    {!candidates.length && <p className="table-help">{query ? "該当する待機客はいません。" : complete ? "4人を選択しました。座席を確認して開始してください。" : "選択できる待機客はいません。"}</p>}
    <button className="button button-primary table-start-button" disabled={pending || !complete || waitingVisits.length < 4}>{pending ? "開始中…" : "この4人で卓を開始"}</button>
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
