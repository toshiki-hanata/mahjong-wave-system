"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CustomerFormState } from "@/app/admin/(protected)/customers/actions";

type FormAction = (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;

export function CustomerForm({ action, initial, submitLabel }: {
  action: FormAction;
  initial?: { customerCode: string; internalName: string; note: string; nickname: string; rankingOptIn: boolean; profileVisible: boolean };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as CustomerFormState);
  const [participating, setParticipating] = useState(initial?.rankingOptIn ?? false);
  return <form action={formAction} className="customer-form">
    {state.message && <p className="form-message" role="alert">{state.message}</p>}
    <div className="form-grid">
      <label>顧客コード<input name="customerCode" required maxLength={80} defaultValue={initial?.customerCode} />{state.fieldErrors?.customerCode?.[0] && <small className="field-error">{state.fieldErrors.customerCode[0]}</small>}</label>
      <label>内部管理名<input name="internalName" required maxLength={120} defaultValue={initial?.internalName} />{state.fieldErrors?.internalName?.[0] && <small className="field-error">{state.fieldErrors.internalName[0]}</small>}</label>
      <label className="form-span">内部メモ<textarea name="note" rows={4} maxLength={2000} defaultValue={initial?.note ?? ""} /></label>
    </div>
    <section className="public-profile-options">
      <div><h2>公開ランキングプロフィール</h2><p>公開情報は内部顧客情報と分けて管理します。</p></div>
      <label className="check-row"><input type="checkbox" name="rankingOptIn" checked={participating} onChange={(event) => setParticipating(event.target.checked)} />公開ランキングに参加する</label>
      <label>公開ニックネーム<input name="nickname" maxLength={60} disabled={!participating} defaultValue={initial?.nickname} required={participating} />{state.fieldErrors?.nickname?.[0] && <small className="field-error">{state.fieldErrors.nickname[0]}</small>}</label>
      <label className="check-row"><input type="checkbox" name="profileVisible" disabled={!participating} defaultChecked={initial?.profileVisible ?? false} />公開プロフィールを表示する</label>
    </section>
    <div className="form-actions"><Link className="button button-secondary" href="/admin/customers">キャンセル</Link><button className="button button-primary" disabled={pending}>{pending ? "保存中…" : submitLabel}</button></div>
  </form>;
}
