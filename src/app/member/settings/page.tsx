import { requireMemberPage, memberCookie } from "@/features/customer-auth/portal-http";
import { getMemberPortalData } from "@/features/customer-auth/portal-data";
import { MemberRegistrationForm, MemberSecurityActions, MemberLogoutButton } from "@/features/customer-auth/portal-forms";
export default async function SettingsPage() {
  const { database } = await requireMemberPage(), data = await getMemberPortalData(database, await memberCookie());
  return <><h2>ログインの管理</h2>{!data.recoveryAcknowledged && <p className="business-warning">復旧コードの保管確認がまだです。表示を閉じてしまった場合は、パスキーで本人確認し直して再発行してください。</p>}<MemberSecurityActions credentials={data.credentials} /><MemberRegistrationForm kind="ADD" /><div className="business-links"><MemberLogoutButton /><MemberLogoutButton all /></div></>;
}
