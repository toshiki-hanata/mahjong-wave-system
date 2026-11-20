"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/admin/actions";

const navigation: Array<{ label: string; icon: string; href: string; count?: string; unavailable?: boolean }> = [
  { label: "ダッシュボード", icon: "◈", href: "/admin" },
  { label: "営業開始・終了", icon: "◷", href: "/admin/business-days" },
  { label: "卓・対局", icon: "▦", href: "/admin/tables" },
  { label: "顧客管理", icon: "♙", href: "/admin/customers" },
  { label: "受付・来店中", icon: "●", href: "/admin/visits" },
  { label: "スタッフ成績・本数", icon: "♙", href: "/admin/staff-games" },
  { label: "会計", icon: "￥", href: "#accounting", unavailable: true },
];

export function Sidebar({ storeName, staffName, role, canManageStaff }: { storeName: string; staffName: string; role: string; canManageStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 680px)");
    if (!mobile.matches) return;
    const main = document.querySelector<HTMLElement>(".main-content");
    const wasInert = main?.inert;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const focusable = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? []).filter((element): element is HTMLElement => Boolean(element));
    const trigger = toggleRef.current;
    menuRef.current?.querySelector<HTMLElement>(".main-nav a[href]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || (!event.shiftKey && index === elements.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault();
        (event.shiftKey ? elements.at(-1) : elements[0])?.focus();
      }
    };
    const onResize = () => { if (!mobile.matches) setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    mobile.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      mobile.removeEventListener("change", onResize);
      if (main) main.inert = wasInert ?? false;
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      if (mobile.matches) trigger?.focus({ preventScroll: true });
    };
  }, [open]);
  const canManageRules = role === "オーナー" || role === "マネージャー";

  return <>
    <button ref={toggleRef} type="button" className="mobile-menu" aria-label={open ? "メニューを閉じる" : "メニューを開く"} aria-expanded={open} aria-controls="store-navigation" onClick={() => setOpen(!open)}>{open ? "×" : "☰"}</button>
    <button type="button" className="mobile-menu-backdrop" hidden={!open} tabIndex={-1} aria-label="メニューの外側を押して閉じる" onClick={() => setOpen(false)} />
    <aside ref={menuRef} id="store-navigation" className={`sidebar${open ? " open" : ""}`} role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label="店舗メニュー">
      <button className="mobile-menu-close" type="button" aria-label="メニューを閉じる" onClick={() => setOpen(false)}>×</button>
      <a className="brand" href="/admin" aria-label="麻雀ウェーブ ホーム"><span className="brand-mark" aria-hidden="true">波</span><span><strong>麻雀ウェーブ</strong><small>STORE MANAGEMENT</small></span></a>
      <div className="store-switch"><span className="store-avatar">波</span><span><strong>{storeName}</strong><small>店舗スタッフ</small></span><span className="chevron">⌄</span></div>
      <nav className="main-nav" aria-label="メインメニュー">
        <p className="nav-label">WORKSPACE</p>
        {navigation.map((item) => {
          if (item.unavailable) return <span key={item.label} className="nav-item is-disabled" role="link" aria-disabled="true"><span className="nav-icon">{item.icon}</span>{item.label}<small className="nav-note">準備中</small></span>;
          const active = item.href.startsWith("/admin") && (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href));
          return <a key={item.label} className={`nav-item${active ? " active" : ""}`} href={item.href} onClick={() => setOpen(false)}><span className="nav-icon">{item.icon}</span>{item.label}{item.count && <span className="nav-count">{item.count}</span>}</a>;
        })}
        <p className="nav-label nav-label-spaced">ANALYTICS</p>
        {canManageRules && <a className={`nav-item${pathname.startsWith("/admin/store-rules") ? " active" : ""}`} href="/admin/store-rules" onClick={() => setOpen(false)}><span className="nav-icon">⚙</span>半荘ルール</a>}
        {canManageStaff && <a className={`nav-item${pathname.startsWith("/admin/staff-sessions") ? " active" : ""}`} href="/admin/staff-sessions" onClick={() => setOpen(false)}><span className="nav-icon">♙</span>スタッフセッション管理</a>}
        {canManageStaff && <a className={`nav-item${pathname === "/admin/security/mfa" ? " active" : ""}`} href="/admin/security/mfa" onClick={() => setOpen(false)}><span className="nav-icon">⚿</span>自分の追加認証</a>}
        <a className="nav-item" href="/admin/business-days" onClick={() => setOpen(false)}><span className="nav-icon">▥</span>売上・本数</a>
        <a className={`nav-item${pathname === "/admin/rankings" ? " active" : ""}`} href="/admin/rankings" onClick={() => setOpen(false)}><span className="nav-icon">♜</span>ランキング</a>
        {canManageRules && <a className={`nav-item${pathname.startsWith("/admin/rankings/settings") ? " active" : ""}`} href="/admin/rankings/settings" onClick={() => setOpen(false)}><span className="nav-icon">⚙</span>ランキング規定打数</a>}
      </nav>
      <div className="sidebar-bottom"><span className="nav-item is-disabled" role="link" aria-disabled="true"><span className="nav-icon">⚙</span>店舗設定<small className="nav-note">準備中</small></span>
        <div className="user-card"><span className="user-avatar">{staffName.slice(0, 1)}</span><span><strong>{staffName}</strong><small>{role}</small></span><form action={logoutAction} data-confirm-leave><button className="more-button" aria-label="ログアウト" title="このアカウントの全端末からログアウト">↪</button></form></div>
      </div>
    </aside>
  </>;
}
