import Link from "next/link";
import { Role } from "@prisma/client";
import { getRankingSettings } from "@/features/rankings/ranking-settings";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { updateRankingSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function RankingSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [staff, params] = await Promise.all([requireRole([Role.OWNER, Role.MANAGER]), searchParams]);
  const settings = await getRankingSettings(prisma, staff.storeId);
  return <div className="page-content rankings-page">
    <header className="rankings-heading"><div><p className="eyebrow">RANKING SETTINGS</p><h1>ランキング規定打数</h1><p className="welcome-subtitle">規定打数未満でも成績は表示し、ランキング順位のみ対象外にします。</p></div><Link className="button button-secondary" href="/admin/rankings">ランキングへ戻る</Link></header>
    {params.saved && <p className="ranking-notice" role="status">店舗設定を保存しました。</p>}
    {params.error && <p className="ranking-error" role="alert">入力値を確認してください。各規定打数は1以上100,000以下です。</p>}
    {!prisma && <p className="ranking-error" role="status">データベースへ接続できません。</p>}
    <form action={updateRankingSettingsAction} className="panel ranking-settings-form">
      <label>月間の最低半荘数<input type="number" name="monthlyMinimumGames" min={1} max={100000} required defaultValue={settings.monthlyMinimumGames} /></label>
      <label>年間の最低半荘数<input type="number" name="annualMinimumGames" min={1} max={100000} required defaultValue={settings.annualMinimumGames} /></label>
      <label>通算の最低半荘数<input type="number" name="lifetimeMinimumGames" min={1} max={100000} required defaultValue={settings.lifetimeMinimumGames} /></label>
      <div className="ranking-settings-help"><p>現在の初期値：月間10、年間30、通算30半荘です。</p><p>規定数未達の顧客も一覧に成績を表示しますが、順位を付けません。</p></div>
      <button className="button button-primary" type="submit" disabled={!prisma}>設定を保存</button>
    </form>
  </div>;
}
