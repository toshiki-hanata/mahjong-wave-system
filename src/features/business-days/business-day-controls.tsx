"use client";

import { useActionState, useState } from "react";
import { closeBusinessDayAction, openBusinessDayAction, updateFreeGamePriceAction, updateBusinessDayTimesAction, type BusinessDayActionState } from "@/app/admin/(protected)/business-days/actions";
import { businessLocalDateTime } from "./business-day-time";

const initial: BusinessDayActionState = {};

export function BusinessDayTimeForm({ day, mode, requestKey, defaultCloseAt, blocked = false }: {
  day: { id: string; openedAt: string; closedAt: string | null; timezone: string };
  mode: "edit" | "close"; requestKey: string; defaultCloseAt: string; blocked?: boolean;
}) {
  const [key] = useState(requestKey);
  const [state, action, pending] = useActionState(updateBusinessDayTimesAction, initial);
  const [opened, setOpened] = useState(() => businessLocalDateTime(new Date(day.openedAt), day.timezone));
  const [closed, setClosed] = useState(() => day.closedAt ? businessLocalDateTime(new Date(day.closedAt), day.timezone) : mode === "close" ? businessLocalDateTime(new Date(defaultCloseAt), day.timezone) : "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const disabled = pending || blocked || state.success === true;
  const prefix = `time-${mode}-${day.id}`;
  return <form action={action} className="business-controls business-time-form">
    <input type="hidden" name="businessDayId" value={day.id} />
    <input type="hidden" name="requestKey" value={key} />
    <input type="hidden" name="mode" value={mode} />
    <input type="hidden" name="expectedOpenedAt" value={day.openedAt} />
    <input type="hidden" name="expectedClosedAt" value={day.closedAt ?? ""} />
    <p>日時は店舗のタイムゾーン（{day.timezone}）です。来店・対局・料金・営業への所属は変更しません。</p>
    <label htmlFor={`${prefix}-opened`}>開始日時</label>
    <input id={`${prefix}-opened`} type="datetime-local" step="1" name="openedAtLocal" required value={opened} onChange={(event) => setOpened(event.target.value)} disabled={disabled} />
    {day.closedAt || mode === "close" ? <>
      <label htmlFor={`${prefix}-closed`}>{mode === "close" ? "実際に営業を終了した日時" : "終了日時"}</label>
      <input id={`${prefix}-closed`} type="datetime-local" step="1" name="closedAtLocal" required value={closed} onChange={(event) => setClosed(event.target.value)} disabled={disabled} />
    </> : <input type="hidden" name="closedAtLocal" value="" />}
    <label htmlFor={`${prefix}-reason`}>{mode === "close" ? "終了忘れの理由" : "訂正理由"}</label>
    <textarea id={`${prefix}-reason`} name="reason" required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled} />
    <label className="business-confirm"><input type="checkbox" name="confirmed" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={disabled} />日時・本数・売上と、来店・卓の記録を確認しました</label>
    {blocked && <p className="business-warning">先に利用中の卓を解放し、全員を退店処理してください。</p>}
    <button className="button button-secondary" disabled={disabled || !confirmed}>{pending ? "保存中…" : mode === "close" ? "指定した日時で営業を終了する" : "理由を残して日時を訂正する"}</button>
    <Notice state={state} />
  </form>;
}

function Notice({ state }: { state: BusinessDayActionState }) {
  return state.message ? <p className={state.success ? "business-success" : "business-error"} role={state.success ? "status" : "alert"}>{state.message}</p> : null;
}

export function OpenBusinessDayForm({ requestKey, blocked }: { requestKey: string; blocked: boolean }) {
  const [key] = useState(requestKey);
  const [state, action, pending] = useActionState(openBusinessDayAction, initial);
  return <form action={action} className="business-controls">
    <input type="hidden" name="requestKey" value={key} />
    <button className="button button-primary" disabled={pending || blocked}>{pending ? "開始中…" : "営業を開始する"}</button>
    <Notice state={state} />
  </form>;
}

export function CloseBusinessDayForm({ businessDayId, blocked }: { businessDayId: string; blocked: boolean }) {
  const [state, action, pending] = useActionState(closeBusinessDayAction, initial);
  const [confirmed, setConfirmed] = useState(false);
  return <form action={action} className="business-controls">
    <input type="hidden" name="businessDayId" value={businessDayId} />
    <label className="business-confirm"><input type="checkbox" name="confirmed" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={blocked || pending} />半荘結果の入力、本数・売上、全員の退店を確認しました</label>
    <button className="button button-secondary" disabled={pending || blocked || !confirmed}>{pending ? "終了中…" : "確認して営業を終了する"}</button>
    <Notice state={state} />
  </form>;
}

export function FreeGamePriceForm({ priceYen }: { priceYen: number }) {
  const [state, action, pending] = useActionState(updateFreeGamePriceAction, initial);
  return <form action={action} className="business-controls">
    <label htmlFor="free-game-price">フリー1本の料金（円）</label>
    <input id="free-game-price" name="priceYen" type="number" inputMode="numeric" min={0} max={1_000_000} step={1} required defaultValue={priceYen} />
    <button className="button button-secondary" disabled={pending}>{pending ? "保存中…" : "次の営業からの料金を保存"}</button>
    <Notice state={state} />
  </form>;
}
