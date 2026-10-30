"use client";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { issuePairingAction, confirmStaffPairingAction, cancelPairingAction, type StaffLinkState } from "@/app/admin/(protected)/customers/[id]/link/actions";

export function PairingRefresh() {
  const router = useRouter();
  useEffect(() => { const timer = window.setInterval(() => router.refresh(), 3000); return () => window.clearInterval(timer); }, [router]);
  return null;
}
export function IssuePairingForm({ customerId, initialKey, activePairingId }: { customerId: string; initialKey: string; activePairingId?: string }) {
  const [key, setKey] = useState(initialKey);
  const [state, action, pending] = useActionState(async (previous: StaffLinkState, form: FormData) => {
    const result = await issuePairingAction(customerId, previous, form);
    setKey(crypto.randomUUID());
    return result;
  }, {} as StaffLinkState);
  return <div><form action={action} className="business-controls"><input type="hidden" name="requestKey" value={key} /><button className="button button-primary" disabled={pending}>{pending ? "発行中…" : "新しい連携QRを発行"}</button></form>
    {state.qrCode && state.pairingId === activePairingId && <div><p>お客さん自身のスマホで読み取ってください。再発行すると前のQRは使えません。</p><Image src={state.qrCode} alt="この会員のスマホ連携用QR" width={256} height={256} unoptimized /><p>有効期限：{state.expiresAt ? new Date(state.expiresAt).toLocaleTimeString("ja-JP") : "—"}</p></div>}
    {state.message && <p role="status">{state.message}</p>}
  </div>;
}
export function ConfirmStaffLinkForm({ customerId, pairingId }: { customerId: string; pairingId: string }) {
  const [state, action, pending] = useActionState(confirmStaffPairingAction.bind(null, customerId), {} as StaffLinkState);
  return <form action={action} className="business-controls"><input type="hidden" name="pairingId" value={pairingId} /><label className="business-confirm"><input type="checkbox" name="confirmed" required disabled={pending} />対象の会員とお客さんの画面の番号を照合しました</label><button className="button button-primary" disabled={pending}>{pending ? "確認中…" : "店員の確認を記録"}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}
export function CancelStaffLinkForm({ customerId, pairingId }: { customerId: string; pairingId: string }) {
  const [state, action, pending] = useActionState(cancelPairingAction.bind(null, customerId), {} as StaffLinkState);
  return <form action={action} className="business-controls"><input type="hidden" name="pairingId" value={pairingId} /><button className="button button-secondary" disabled={pending}>このQRを取り消す</button>{state.message && <p role="status">{state.message}</p>}</form>;
}
