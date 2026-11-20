import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { MfaReplacementForm } from "./replacement-form";
export default async function StaffMfaSettingsPage() {
  const actor = await requireRole(["OWNER", "MANAGER"]);
  const profile = prisma ? await prisma.staffMfa.findFirst({ where: { staffId: actor.id, storeId: actor.storeId }, select: { enabledAt: true, recoveryCodeHashes: true } }) : null;
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">SECURITY</p><h1>自分の追加認証</h1><p>認証アプリは登録済みです。未使用の復旧コード：{profile?.recoveryCodeHashes.length ?? 0}個</p></div></header>
    <div className="panel mfa-settings"><h2>認証アプリ・復旧コードの再設定</h2><p>現在の認証アプリを使えない場合は、一度ログアウトし、パスワード入力後の「認証アプリを使えない場合」から復旧してください。</p><MfaReplacementForm /></div>
  </section>;
}
