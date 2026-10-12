"use client";

import { revokeStaffSessionsAction } from "@/app/admin/(protected)/staff-sessions/actions";

export function RevokeStaffSessionsForm({ staffId, staffName }: { staffId: string; staffName: string }) {
  return <form action={revokeStaffSessionsAction} onSubmit={(event) => {
    if (!window.confirm(`${staffName} のすべてのログイン端末をサインアウトさせます。続けますか？`)) event.preventDefault();
  }}>
    <input type="hidden" name="staffId" value={staffId} />
    <button className="button button-secondary" type="submit">全セッションを失効</button>
  </form>;
}
