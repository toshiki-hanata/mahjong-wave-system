"use client";
import { useEffect, useState } from "react";
export function MfaDeadline({ expiresAt }: { expiresAt: number }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const check = () => { const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)); setSeconds(left); if (!left) window.location.replace("/admin/login?reason=mfa-expired"); };
    check(); const timer = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check); window.addEventListener("pageshow", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("pageshow", check); };
  }, [expiresAt]);
  return <p className="mfa-deadline">{seconds === null ? "この手続きの有効期限は5分です。" : `この手続きの残り時間：${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`}</p>;
}
