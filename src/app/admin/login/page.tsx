import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getCurrentStaff } from "@/lib/auth/current-staff";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  if (await getCurrentStaff()) redirect("/admin");

  return <main className="login-page"><section className="login-card"><a className="brand login-brand" href="/admin/login"><span className="brand-mark" aria-hidden="true">雀</span><span><strong>麻雀ウェーブ</strong><small>STORE MANAGEMENT</small></span></a><div className="login-heading"><p className="eyebrow">STAFF PORTAL</p><h1>スタッフログイン</h1><p>店舗管理画面へログインしてください。</p></div>{reason === "session-expired" && <p className="login-error" role="status">ログインの有効期限が切れました。もう一度ログインしてください。</p>}{reason === "logout-incomplete" && <p className="login-error" role="alert">この端末のCookieは削除しましたが、全端末の失効を確認できません。管理者に連絡してください。</p>}<LoginForm /><p className="login-help">アカウントについては店舗管理者へお問い合わせください。</p></section><footer className="login-footer">麻雀ウェーブ 店舗管理</footer></main>;
}
