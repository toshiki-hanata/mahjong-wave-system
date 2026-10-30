import { participantName, participantCode } from "@/features/staff-participation/participant-policy";
import { randomUUID } from "node:crypto";
import { GameStatus, Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { CorrectGameForm } from "@/features/games/game-forms";
import { getGameDetail } from "@/features/games/game-queries";
import { gameEntryRoles } from "@/features/games/game-permissions";
import { scoreForDisplay, type GameRule } from "@/features/games/game-calculation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function GameDetailPage({ params }: { params: Promise<{ tableSessionId: string; gameId: string }> }) {
  const staff = await requireRole(gameEntryRoles);
  const { tableSessionId, gameId } = await params;
  const game = await getGameDetail(prisma, staff.storeId, gameId);
  if (!game || game.tableSessionId !== tableSessionId) notFound();
  const rule = game.ruleSnapshot as unknown as GameRule;
  const players = game.results.map((result) => ({ position: result.position, visitId: result.visitId, customerId: result.customerId, customer: result.customer }));
  const initialPoints = Object.fromEntries(game.results.map((result) => [result.position, result.finalPoints]));
  const canCorrect = staff.role === Role.OWNER || staff.role === Role.MANAGER;
  return <div className="page-content games-page">
    <header className="games-heading"><div><p className="eyebrow">GAME DETAIL</p><h1>{game.tableSession.mahjongTable.name} · 半荘 {game.sequenceNumber}{game.revisionNumber > 1 ? ` · 訂正版 ${game.revisionNumber}` : ""}</h1><p>結果確定 {game.confirmedAt.toLocaleString("ja-JP", { timeZone: staff.storeTimezone })} · ルール v{Number((game.ruleSnapshot as { version?: unknown }).version ?? 0)}</p></div><a className="button button-secondary" href={`/admin/tables/${game.tableSessionId}/games`}>履歴へ戻る</a></header>
    {game.originalGame && <p className="game-correction-note panel">訂正版です。元の記録: <a href={`/admin/tables/${game.tableSessionId}/games/${game.originalGame.id}`}>半荘 {game.originalGame.sequenceNumber} revision {game.originalGame.revisionNumber}</a></p>}
    {game.status === GameStatus.CORRECTED && <p className="game-warning panel">この結果は訂正済みで、Sprint 5の集計対象から除外します。理由: {game.correctionReason} {game.correctedGame && <>· 訂正版: <a href={`/admin/tables/${game.tableSessionId}/games/${game.correctedGame.id}`}>revision {game.correctedGame.revisionNumber}</a></>}</p>}
    <section className="panel game-detail-results"><h2>確定結果</h2><ol>{game.results.map((result) => <li key={result.id}><b>{result.rank}位</b><span>位置 {result.position}</span><strong>{participantName(result.customer)}</strong><small>{participantCode(result.customer)}</small><span>{result.finalPoints.toLocaleString()}点</span><b>{scoreForDisplay(result.scoreScaled, rule.scorePrecision)} pt</b></li>)}</ol></section>
    {canCorrect && game.status === GameStatus.CONFIRMED && <section className="panel game-correction-panel"><div><h2>結果を訂正</h2><p>元記録を保持し、同じ半荘番号に訂正版を追加します。訂正理由は必須です。</p></div><CorrectGameForm sessionId={game.tableSessionId} sequence={game.sequenceNumber} idempotencyKey={randomUUID()} players={players} rule={rule} initialPoints={initialPoints} gameId={game.id} /></section>}
  </div>;
}
