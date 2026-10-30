"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/admin/actions";

const navigation: Array<{ label: string; icon: string; href: string; count?: string }> = [
  { label: "ダッシュボード", icon: "◈", href: "/admin" },
  { label: "営業開始・終了", icon: "◷", href: "/admin/business-days" },
  { label: "卓・対局", icon: "▦", href: "/admin/tables" },
  { label: "顧客管理", icon: "♙", href: "/admin/customers" },
  { label: "受付・来店中", icon: "●", href: "/admin/visits" },
  { label: "スタッフ成績・本数", icon: "♙", href: "/admin/staff-games" },
  { label: "会計", icon: "￥", href: "#accounting" },
];

export function Sidebar({ storeName, staffName, role, canManageStaff }: { storeName: string; staffName: string; role: string; canManageStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const canManageRules = role === "オーナー" || role === "マネージャー";

  return <>
    <button className="mobile-menu" aria-label="メニューを開く" onClick={() => setOpen(!open)}>☰</button>
    <aside className={`sidebar${open ? " open" : ""}`}>
      <a className="brand" href="/admin" aria-label="麻雀ウェーブ ホーム"><span className="brand-mark" aria-hidden="true">波</span><span><strong>麻雀ウェーブ</strong><small>STORE MANAGEMENT</small></span></a>
      <div className="store-switch"><span className="store-avatar">波</span><span><strong>{storeName}</strong><small>店舗スタッフ</small></span><span className="chevron">⌄</span></div>
      <nav className="main-nav" aria-label="メインメニュー">
        <p className="nav-label">WORKSPACE</p>
        {navigation.map((item) => {
          const active = item.href.startsWith("/admin") && (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href));
          return <a key={item.label} className={`nav-item${active ? " active" : ""}`} href={item.href} onClick={() => setOpen(false)}><span className="nav-icon">{item.icon}</span>{item.label}{item.count && <span className="nav-count">{item.count}</span>}</a>;
        })}
        <p className="nav-label nav-label-spaced">ANALYTICS</p>
        {canManageRules && <a className={`nav-item${pathname.startsWith("/admin/store-rules") ? " active" : ""}`} href="/admin/store-rules" onClick={() => setOpen(false)}><span className="nav-icon">⚙</span>半荘ルール</a>}
        {canManageStaff && <a className={`nav-item${pathname.startsWith("/admin/staff-sessions") ? " active" : ""}`} href="/admin/staff-sessions" onClick={() => setOpen(false)}><span className="nav-icon">♙</span>スタッフセッション管理</a>}
        <a className="nav-item" href="#reports" onClick={() => setOpen(false)}><span className="nav-icon">▥</span>売上・日報</a>
        <a className={`nav-item${pathname === "/admin/rankings" ? " active" : ""}`} href="/admin/rankings" onClick={() => setOpen(false)}><span className="nav-icon">♜</span>ランキング</a>
        {canManageRules && <a className={`nav-item${pathname.startsWith("/admin/rankings/settings") ? " active" : ""}`} href="/admin/rankings/settings" onClick={() => setOpen(false)}><span className="nav-icon">⚙</span>ランキング規定打数</a>}
      </nav>
      <div className="sidebar-bottom"><a className="nav-item" href="#settings"><span className="nav-icon">⚙</span>店舗設定</a>
        <div className="user-card"><span className="user-avatar">{staffName.slice(0, 1)}</span><span><strong>{staffName}</strong><small>{role}</small></span><form action={logoutAction}><button className="more-button" aria-label="ログアウト" title="ログアウト">↪</button></form></div>
      </div>
    </aside>
  </>;
}
