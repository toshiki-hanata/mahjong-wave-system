import { notFound } from "next/navigation";
import { getSessionGames } from "@/features/games/game-queries";
import { gameEntryRoles } from "@/features/games/game-permissions";
import { scoreForDisplay } from "@/features/games/game-calculation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export default async function SessionGamesPage({ params }: { params: Promise<{ tableSessionId: string }> }) {
  const staff = await requireRole(gameEntryRoles);
  const { tableSessionId } = await params;
  const session = await getSessionGames(prisma, staff.storeId, tableSessionId);
  if (!session) notFound();
  return <div className="page-content games-page">
    <header className="games-heading"><div><p className="eyebrow">GAME HISTORY</p><h1>{session.mahjongTable.name} · 対局履歴</h1><p>{session.status === "ACTIVE" ? "稼働中" : "終了"} · {session.games.length} 半荘</p></div>{session.status === "ACTIVE" && <a className="button button-primary" href={`/admin/tables/${session.id}/games/new`}>次の半荘を入力</a>}</header>
    {session.games.length === 0 ? <p className="panel game-empty">このSessionの半荘結果はまだありません。</p> : <div className="game-history-list">{session.games.map((game) => <article className={`panel game-history-card${game.status === "CORRECTED" ? " is-corrected" : ""}`} key={game.id}>
      <header><div><h2>半荘 {game.sequenceNumber}{game.revisionNumber > 1 ? ` · 訂正版 ${game.revisionNumber}` : ""}</h2><p>{game.confirmedAt.toLocaleString("ja-JP", { timeZone: staff.storeTimezone })}{game.status === "CORRECTED" ? " · 訂正済み（集計対象外）" : " · 有効結果"}</p></div><a href={`/admin/tables/${session.id}/games/${game.id}`}>詳細を見る →</a></header>
      <ol>{game.results.map((result) => <li key={result.id}><span>{result.position}番席</span><strong>{result.customer.internalName}</strong><span>{result.finalPoints.toLocaleString()}点</span><b>{result.rank}位</b><b>{scoreForDisplay(result.scoreScaled, 1)} pt</b></li>)}</ol>
      {game.status === "CORRECTED" && game.correctedByGameId && <p className="game-correction-note">訂正理由: {game.correctionReason}</p>}
    </article>)}</div>}
  </div>;
}
