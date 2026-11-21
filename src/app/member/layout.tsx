import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalConfig } from "@/features/customer-auth/portal-config";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "マイページ | 麻雀ウェーブ", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  if (!getPortalConfig()) notFound();
  return <div className="page-content business-page member-portal"><header className="business-heading"><p className="eyebrow">麻雀ウェーブ</p><h1>お客さまマイページ</h1></header><nav className="business-links" aria-label="マイページメニュー"><Link className="button button-secondary" href="/member">成績・ポイント</Link><Link className="button button-secondary" href="/member/settings">ログインの管理</Link></nav>{children}</div>;
}
