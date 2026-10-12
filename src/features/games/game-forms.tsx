"use client";

import { useMemo, useState } from "react";
import { calculateGame, scoreForDisplay, type GameRule } from "@/features/games/game-calculation";
import { createGameAction, correctGameAction } from "@/app/admin/(protected)/games/actions";

type Player = { position: number; visitId: string; customerId: string; customer: { internalName: string; customerCode: string } };

function PointsEntry({
  sessionId, sequence, idempotencyKey, players, rule, initialPoints, correction,
}: {
  sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule;
  initialPoints?: Record<number, number>; correction?: { gameId: string; reason?: string };
}) {
  const [points, setPoints] = useState<Record<number, string>>(Object.fromEntries([1, 2, 3, 4].map((position) => [position, initialPoints?.[position]?.toString() ?? ""])));
  const preview = useMemo(() => {
    if ([1, 2, 3, 4].some((position) => points[position] === "" || !Number.isInteger(Number(points[position])))) return null;
    try {
      return calculateGame(players.map((player) => ({ ...player, finalPoints: Number(points[player.position]) })), rule);
    } catch { return null; }
  }, [players, points, rule]);
  const total = [1, 2, 3, 4].reduce((sum, position) => sum + (Number(points[position]) || 0), 0);
  const action = correction ? correctGameAction : createGameAction;

  return <form action={action} className="game-entry-form">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    {correction ? <input type="hidden" name="gameId" value={correction.gameId} /> : <input type="hidden" name="tableSessionId" value={sessionId} />}
    <div className="game-point-grid">
      {[...players].sort((a, b) => a.position - b.position).map((player) => {
        const result = preview?.find((item) => item.position === player.position);
        return <label className="game-player-input" key={player.position}>
          <span className="game-position">位置 {player.position}</span>
          <strong>{player.customer.internalName}</strong><small>{player.customer.customerCode}</small>
          <input name={`points${player.position}`} type="number" inputMode="decimal" step={rule.pointUnit} required value={points[player.position]} onChange={(event) => setPoints((current) => ({ ...current, [player.position]: event.target.value }))} aria-label={`位置${player.position}の最終持ち点`} />
          {result && <span className="game-preview">{result.rank}位 · {scoreForDisplay(result.scoreScaled, rule.scorePrecision)} pt</span>}
        </label>;
      })}
    </div>
    <div className={`game-total${total === rule.requiredTotal ? " is-valid" : ""}`}><span>合計点</span><strong>{total.toLocaleString("ja-JP")} / {rule.requiredTotal.toLocaleString("ja-JP")}</strong><small>{rule.pointUnit}点単位・マイナス点{rule.allowNegative ? "可" : "不可"}</small></div>
    {correction && <label className="game-correction-reason">訂正理由（必須）<small>顧客の個人情報やパスワードなどの秘密情報は記載しないでください。</small><input name="reason" required maxLength={500} defaultValue={correction.reason ?? ""} /></label>}
    <button className="button button-primary game-submit" type="submit">{correction ? "訂正版を保存" : `Game ${sequence} を確定`}</button>
    <p className="game-form-note">確定時にサーバー側でも参加者・点数・順位・成績点を再検証します。</p>
  </form>;
}

export function NewGameForm(props: { sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule }) {
  return <PointsEntry {...props} />;
}

export function CorrectGameForm(props: { sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule; initialPoints: Record<number, number>; gameId: string }) {
  return <PointsEntry {...props} correction={{ gameId: props.gameId }} initialPoints={props.initialPoints} />;
}
