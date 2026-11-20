"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function ReceptionBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount), [failed, setFailed] = useState(false), [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let controller: AbortController | undefined, stopped = false, inFlight = false;
    const update = async () => {
      if (stopped || inFlight || document.hidden) return;
      inFlight = true; controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const r = await fetch("/api/staff/reception-count", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!r.ok) throw new Error("Unavailable");
        const next: unknown = await r.json();
        if (!next || typeof next !== "object" || !("count" in next) || !Number.isSafeInteger(next.count) || Number(next.count) < 0) throw new Error("Invalid count");
        if (!stopped) { setCount(Number(next.count)); setFailed(false); setEnabled(!("enabled" in next) || next.enabled !== false); }
      } catch { if (!stopped) setFailed(true); } finally { clearTimeout(timeout); inFlight = false; }
    };
    const timer = setInterval(update, 20000); document.addEventListener("visibilitychange", update); window.addEventListener("wave:reception-updated", update);
    return () => { stopped = true; clearInterval(timer); controller?.abort(); document.removeEventListener("visibilitychange", update); window.removeEventListener("wave:reception-updated", update); };
  }, []);
  if (!enabled) return null;
  return <Link href="/admin/reception-qr" prefetch={false} className={`reception-badge${count ? " has-pending" : ""}${failed ? " is-stale" : ""}`} aria-label={failed ? "受付待ちの件数を確認できません。QR受付を開く" : `QR受付の確認待ち ${count}件`}><span aria-live="polite" aria-atomic="true">{failed ? "受付待ち 要確認" : <>受付待ち <strong>{count}</strong>件</>}</span></Link>;
}
