import { notFound } from "next/navigation";

import type { Metadata } from "next";
import { getPortalConfig } from "@/features/customer-auth/portal-config";
import { CustomerLinkForm } from "@/features/customer-auth/customer-link-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "スマホ連携 | 麻雀ウェーブ", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function MemberLinkPage() {
  const settings = getPortalConfig();
  if (!settings) notFound();
  return <main className="page-content business-page"><header className="business-heading"><p className="eyebrow">麻雀ウェーブ</p><h1>スマホ連携</h1></header>{settings ? <CustomerLinkForm /> : <p>スマホ連携は準備中です。店員による受付をご利用ください。</p>}</main>;
}
