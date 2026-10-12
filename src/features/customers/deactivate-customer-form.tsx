"use client";

import { deactivateCustomerAction } from "@/app/admin/(protected)/customers/actions";

export function DeactivateCustomerForm({ customerId }: { customerId: string }) {
  return <form action={deactivateCustomerAction} onSubmit={(event) => {
    if (!window.confirm("この顧客を無効化しますか？顧客情報や履歴は削除されません。")) event.preventDefault();
  }}>
    <input type="hidden" name="customerId" value={customerId} />
    <button className="button button-danger" type="submit">顧客を無効化</button>
  </form>;
}
