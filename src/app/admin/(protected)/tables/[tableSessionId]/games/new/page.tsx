import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewGameForm } from "@/features/games/game-forms";
import { getGameEntryData } from "@/features/games/game-queries";
import { gameEntryRoles } from "@/features/games/game-permissions";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function NewGamePage({ params, searchParams }: { params: Promise<{ tableSessionId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const staff = await requireRole(gameEntryRoles);
  const { tableSessionId } = await params;
  const { saved } = await searchParams;
  const data = await getGameEntryData(prisma, staff.storeId, tableSessionId);
  if (!data) notFound();
  const { session, rule, nextSequence } = data;
  const isReady = session.status === "ACTIVE" && session.seats.length === 4 && session.seats.every((seat) => seat.visit.status === "PLAYING" && seat.visit.storeId === staff.storeId && seat.visit.customer.storeId === staff.storeId && seat.visit.customer.isActive) && [1, 2, 3, 4].every((position) => session.seats.filter((seat) => seat.position === position).length === 1);
  const players = session.seats.map((seat) => ({ position: seat.position, visitId: seat.visit.id, customerId: seat.visit.customerId, customer: seat.visit.customer }));
  return <div className="page-content games-page">
    <header className="games-heading"><div><p className="eyebrow">GAME RESULT</p><h1>{session.mahjongTable.name} · 半荘 {nextSequence}</h1><p>4人のお名前と座席を確認して、最終持ち点を入力してください。</p></div><Link className="button button-secondary" href="/admin/tables">卓一覧へ</Link></header>
    {saved && /^\d+$/.test(saved) && Number(saved) > 0 && <p className="game-saved-notice" role="status">半荘{saved}を保存しました。次の半荘の入力画面です。</p>}
    {session.status !== "ACTIVE" && <p className="game-warning">このSessionは終了しています。新しい結果は登録できません。</p>}
    {!isReady && session.status === "ACTIVE" && <p className="game-warning">席・来店状態を確認できないため入力できません。</p>}
    {!rule && <p className="game-warning">有効なStoreRuleがありません。OWNER/MANAGERに確認してください。</p>}
    {rule && isReady && <>
      <NewGameForm key={`${session.id}-${nextSequence}-${data.seatingToken}`} sessionId={session.id} sequence={nextSequence} idempotencyKey={randomUUID()} seatingToken={data.seatingToken} players={players} rule={rule} />
      <details className="game-rule-details"><summary>成績計算のルールを確認</summary><section className="game-rule-summary panel"><strong>適用ルール v{rule.version} · {rule.isProvisional ? "暫定" : "店舗運用"}</strong><span>開始 {rule.startingPoints.toLocaleString()} / 返し {rule.returnPoints.toLocaleString()} / ウマ {rule.umaFirst}, {rule.umaSecond}, {rule.umaThird}, {rule.umaFourth} / オカ +{rule.okaTop}</span></section></details>
    </>}
  </div>;
}
