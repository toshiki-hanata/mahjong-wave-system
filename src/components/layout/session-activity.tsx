"use client";

import { useEffect, useState } from "react";
import { refreshStaffSessionAction } from "@/app/admin/session-actions";
import { STAFF_SESSION_POLICY } from "@/lib/auth/session-policy";

export function SessionActivity({ idleExpiresAt, expiresAt }: { idleExpiresAt: number; expiresAt: number }) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let idleEnd = idleExpiresAt, absoluteEnd = expiresAt, lastAttempt = 0, pending = false, disposed = false;
    const expire = () => window.location.replace("/admin/login?reason=session-expired");
    const onActivity = async () => {
      if (document.visibilityState !== "visible" || pending || Date.now() - lastAttempt < STAFF_SESSION_POLICY.refreshIntervalMs) return;
      if (Date.now() >= Math.min(idleEnd, absoluteEnd)) { expire(); return; }
      lastAttempt = Date.now(); pending = true;
      try {
        const result = await refreshStaffSessionAction();
        if (disposed) return;
        if (result.status === "EXPIRED") { expire(); return; }
        if (result.status === "UNAVAILABLE") setUnavailable(true);
        else { idleEnd = result.idleExpiresAt; absoluteEnd = result.expiresAt; setUnavailable(false); }
      } catch { if (!disposed) setUnavailable(true); }
      finally { pending = false; }
    };
    const checkExpiry = () => { if (Date.now() >= Math.min(idleEnd, absoluteEnd)) expire(); };
    const timer = window.setInterval(checkExpiry, 1000);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      disposed = true; window.clearInterval(timer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [idleExpiresAt, expiresAt]);
  return unavailable ? <p className="business-warning" role="alert">接続を確認できません。入力内容を控えてください。ログイン期限を延長できない場合は再ログインが必要です。</p> : null;
}
