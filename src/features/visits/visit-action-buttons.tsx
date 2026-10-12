"use client";

import { useActionState } from "react";
import { checkInVisitAction, checkOutVisitAction, type VisitActionState } from "@/app/admin/(protected)/visits/actions";

const emptyState: VisitActionState = {};

export function CheckInButton({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState(checkInVisitAction, emptyState);
  if (state.success) return <p className="visit-action-result" role="status">{state.message}</p>;
  return <form action={action} className="visit-inline-action">
    <input type="hidden" name="customerId" value={customerId} />
    <button className="button button-primary" type="submit" disabled={pending}>{pending ? "受付中…" : "チェックイン"}</button>
    {state.message && <p className="visit-action-error" role="alert">{state.message}</p>}
  </form>;
}

export function CheckOutButton({ visitId }: { visitId: string }) {
  const [state, action, pending] = useActionState(checkOutVisitAction, emptyState);
  return <form action={action} className="visit-inline-action">
    <input type="hidden" name="visitId" value={visitId} />
    <button className="button button-secondary" type="submit" disabled={pending}>{pending ? "処理中…" : "チェックアウト"}</button>
    {state.message && <p className="visit-action-error" role="alert">{state.message}</p>}
  </form>;
}
