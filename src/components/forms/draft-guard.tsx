"use client";
import { useEffect, useId, useSyncExternalStore } from "react";
const drafts = new Set<string>();
let snapshot: { url: string; state: unknown } | undefined;
const message = "保存されていない入力、または保存中の内容があります。この画面から移動しますか？";
const subscribe = () => () => {}, ready = () => true, notReady = () => false;
export function DraftNavigationGuard() {
  useEffect(() => {
    let skipUnloadUntil = 0;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (drafts.size && Date.now() > skipUnloadUntil) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (!drafts.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(element instanceof HTMLAnchorElement) || element.target === "_blank" || element.hasAttribute("download")) return;
      const next = new URL(element.href, location.href), current = new URL(location.href);
      if (!["http:", "https:"].includes(next.protocol) || (next.origin === current.origin && next.pathname === current.pathname && next.search === current.search)) return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopImmediatePropagation(); }
      else skipUnloadUntil = Date.now() + 1500;
    };
    const pop = (event: PopStateEvent) => {
      if (!drafts.size || !snapshot || window.confirm(message)) return;
      event.stopImmediatePropagation();
      // Preserve the existing Next history state and mounted form when a user cancels Back/Forward.
      history.pushState(snapshot.state, "", snapshot.url);
    };
    const submit = (event: SubmitEvent) => {
      if (!drafts.size || !(event.target instanceof HTMLFormElement) || !event.target.hasAttribute("data-confirm-leave")) return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", click, true); window.addEventListener("popstate", pop, true); document.addEventListener("submit", submit, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); window.removeEventListener("popstate", pop, true); document.removeEventListener("submit", submit, true); };
  }, []);
  return null;
}
export function useUnsavedDraft(dirty: boolean): boolean {
  const id = useId(), hydrated = useSyncExternalStore(subscribe, ready, notReady);
  useEffect(() => { if (dirty) { drafts.add(id); snapshot = { url: location.href, state: history.state }; } else drafts.delete(id); return () => { drafts.delete(id); }; }, [dirty, id]);
  return hydrated;
}
export function DraftStatus({ dirty, pending }: { dirty: boolean; pending: boolean }) {
  return dirty || pending ? <p className="form-draft-status" role="status">{pending ? "保存中です。完了するまでこの画面でお待ちください。" : "未保存の入力があります。保存すると記録されます。"}</p> : null;
}
