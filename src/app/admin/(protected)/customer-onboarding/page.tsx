import Link from "next/link";
import { requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
export default async function CustomerOnboardingPage() {
  const staff = await requireStaff();
  if (!prisma) return <p>データベースへ接続できません。</p>;
  const rows = await prisma.customer.findMany({ where: { storeId: staff.storeId, isActive: true, participantStaffId: null, authIdentity: { activatedAt: { not: null } }, legacyPointMigration: null }, orderBy: [{ authIdentity: { activatedAt: "asc" } }, { id: "asc" }], take: 101, select: { id: true, internalName: true, customerCode: true } });
  return <div className="page-content business-page"><h1>初回連携・ポイント引継ぎ待ち</h1><p>スマホ連携が完了し、引継ぎ確認が未記録の会員です。引継ぎ・訂正はOWNER／MANAGERが行います。</p><div className="business-links"><Link className="button button-secondary" href="/admin/customers">会員を検索する</Link></div>{!rows.length && <p>引継ぎ確認待ちはありません。</p>}{rows.length > 100 && <p>先頭100件を表示しています。残りは会員検索から確認できます。</p>}{rows.slice(0, 100).map(c => <article className="panel business-panel" key={c.id}><h2>{c.internalName}</h2><p>{c.customerCode}</p><Link className="button button-primary" href={`/admin/customers/${encodeURIComponent(c.id)}/points`}>ポイントを確認する</Link></article>)}</div>;
}
