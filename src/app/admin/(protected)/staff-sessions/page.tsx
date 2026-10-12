import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { RevokeStaffSessionsForm } from "@/lib/auth/revoke-sessions-form";

export default async function StaffSessionsPage({ searchParams }: { searchParams: Promise<{ revoked?: string; error?: string }> }) {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const params = await searchParams;
  const staff = prisma ? await prisma.staff.findMany({
    where: { storeId: actor.storeId }, orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, loginId: true, role: true, isActive: true },
  }) : [];

  return <section className="page-section staff-sessions-page">
    <header className="page-header"><div><p className="eyebrow">SECURITY</p><h1>スタッフセッション管理</h1><p>強制失効すると、このスタッフのログイン中のすべての端末からサインアウトされます。</p></div></header>
    {params.revoked && <p role="status">セッションを失効しました。</p>}
    {params.error && <p role="alert">操作を完了できませんでした。対象スタッフと権限を確認してください。</p>}
    <div className="table-responsive"><table><thead><tr><th>スタッフ</th><th>ログインID</th><th>権限</th><th>状態</th><th>操作</th></tr></thead><tbody>
      {staff.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.loginId}</td><td>{member.role}</td><td>{member.isActive ? "有効" : "無効"}</td><td>
        {member.id === actor.id ? "現在のアカウント" : actor.role === "MANAGER" && member.role === "OWNER" ? "" : <RevokeStaffSessionsForm staffId={member.id} staffName={member.name} />}
      </td></tr>)}
    </tbody></table></div>
  </section>;
}
