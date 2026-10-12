import { getStoreRules } from "@/features/games/game-queries";
import { storeRuleRoles } from "@/features/games/game-permissions";
import { StoreRuleForm } from "@/features/games/store-rule-form";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function StoreRulesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const staff = await requireRole(storeRuleRoles);
  const { error } = await searchParams;
  const rules = await getStoreRules(prisma, staff.storeId);
  const current = rules.find((rule) => rule.isActive);
  return <div className="page-content games-page">
    {error === "rule-unavailable" && <p className="game-warning" role="alert">有効なStoreRuleを確認できません。</p>}
    <header className="games-heading"><div><p className="eyebrow">STORE RULES</p><h1>半荘ルール</h1><p>ルールはversionで保存し、新規TableSession開始時に固定します。</p></div><span className="provisional-badge">{current?.isProvisional ? "開発用の暫定ルール" : "店舗運用ルール"}</span></header>
    <section className="panel store-rule-panel"><div className="game-section-title"><h2>新しいルールversion</h2><p>既存versionの値は編集しません。開始済みSessionには反映されません。</p></div><StoreRuleForm current={current ? { startingPoints: current.startingPoints, returnPoints: current.returnPoints, umaFirst: current.umaFirst, umaSecond: current.umaSecond, umaThird: current.umaThird, umaFourth: current.umaFourth, okaTop: current.okaTop, pointUnit: current.pointUnit, requiredTotal: current.requiredTotal, allowNegative: current.allowNegative, tieBreakRule: current.tieBreakRule, scorePointDivisor: current.scorePointDivisor, scorePrecision: current.scorePrecision, roundingMode: current.roundingMode, isProvisional: current.isProvisional } : undefined} /></section>
    <section className="panel store-rule-history"><div className="game-section-title"><h2>version履歴</h2><p>Gameは使用したルールsnapshotを保持します。</p></div>{rules.length === 0 ? <p>ルールは未登録です。</p> : <ol>{rules.map((rule) => <li key={rule.id}><strong>version {rule.version}{rule.isActive ? " · 現在有効" : ""}{rule.isProvisional ? " · 暫定" : " · 店舗運用"}</strong><span>{rule.startingPoints.toLocaleString()}点開始 / {rule.returnPoints.toLocaleString()}点返し · ウマ {rule.umaFirst}/{rule.umaSecond}/{rule.umaThird}/{rule.umaFourth} · オカ {rule.okaTop}</span><small>入力単位 {rule.pointUnit}点 · 合計 {rule.requiredTotal.toLocaleString()}点 · score除数 {rule.scorePointDivisor}点 · 同点 position順 · {rule.createdAt.toLocaleString("ja-JP", { timeZone: staff.storeTimezone })}</small></li>)}</ol>}</section>
  </div>;
}
