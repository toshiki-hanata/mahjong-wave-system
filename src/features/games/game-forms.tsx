"use client";
import { participantName, participantCode } from "@/features/staff-participation/participant-policy";

import { useActionState, useMemo, useState } from "react";
import { calculateGame, scoreForDisplay, type GameRule } from "@/features/games/game-calculation";
import { createGameAction, correctGameAction, type GameFormState } from "@/app/admin/(protected)/games/actions";

type Player = { position: number; visitId: string; customerId: string; customer: { internalName: string; participantStaffId?: string | null; customerCode: string } };

function PointsEntry({
  sessionId, sequence, idempotencyKey, players, rule, initialPoints, correction, seatingToken,
}: {
  sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule;
  initialPoints?: Record<number, number>; correction?: { gameId: string; reason?: string };
  seatingToken?: string;
}) {
  const [requestKey] = useState(idempotencyKey);
  const [reason, setReason] = useState(correction?.reason ?? "");
  const [state, action, pending] = useActionState(correction ? correctGameAction : createGameAction, {} as GameFormState);
  const [points, setPoints] = useState<Record<number, string>>(Object.fromEntries([1, 2, 3, 4].map((position) => [position, initialPoints?.[position]?.toString() ?? ""])));
  const calculation = useMemo(() => {
    if ([1, 2, 3, 4].some((position) => points[position] === "" || !Number.isInteger(Number(points[position])))) return { results: null, error: "4人の持ち点を整数で入力してください。" };
    try {
      return { results: calculateGame(players.map((player) => ({ ...player, finalPoints: Number(points[player.position]) })), rule), error: null };
    } catch (error) { return { results: null, error: error instanceof Error ? error.message : "点数を確認してください。" }; }
  }, [players, points, rule]);
  const preview = calculation.results;
  const total = [1, 2, 3, 4].reduce((sum, position) => sum + (Number(points[position]) || 0), 0);

  return <form action={action} className="game-entry-form">
    <input type="hidden" name="idempotencyKey" value={requestKey} />
    {!correction && <><input type="hidden" name="seatingToken" value={seatingToken} /><input type="hidden" name="expectedSequence" value={sequence} /></>}
    {correction ? <input type="hidden" name="gameId" value={correction.gameId} /> : <input type="hidden" name="tableSessionId" value={sessionId} />}
    <div className="game-point-grid">
      {[...players].sort((a, b) => a.position - b.position).map((player) => {
        const result = preview?.find((item) => item.position === player.position);
        return <label className="game-player-input" key={player.position}>
          <span className="game-position">座席 {player.position}</span>
          <strong>{participantName(player.customer)}</strong><small>{participantCode(player.customer)}</small>
          <input name={`points${player.position}`} type="number" inputMode="decimal" step={rule.pointUnit} required disabled={pending} value={points[player.position]} onChange={(event) => setPoints((current) => ({ ...current, [player.position]: event.target.value }))} aria-label={`座席${player.position}の最終持ち点`} />
          {rule.allowNegative && <button className="game-sign-toggle" type="button" disabled={pending || !points[player.position] || !Number(points[player.position])} onClick={() => setPoints((current) => ({ ...current, [player.position]: String(-Number(current[player.position])) }))}>{Number(points[player.position]) < 0 ? "プラスにする" : "マイナスにする"}</button>}
          {result && <span className="game-preview">{result.rank}位 · {scoreForDisplay(result.scoreScaled, rule.scorePrecision)} pt</span>}
        </label>;
      })}
    </div>
    <div className={`game-total${total === rule.requiredTotal ? " is-valid" : ""}`}><span>合計点</span><strong>{total.toLocaleString("ja-JP")} / {rule.requiredTotal.toLocaleString("ja-JP")}</strong><small>{rule.pointUnit}点単位・マイナス点{rule.allowNegative ? "可" : "不可"}</small></div>
    {calculation.error && <p className="game-entry-hint" role="status">{calculation.error}</p>}
    {Object.values(points).some(Boolean) && total !== rule.requiredTotal && <p className="game-entry-hint" role="status">{total < rule.requiredTotal ? `あと ${(rule.requiredTotal - total).toLocaleString("ja-JP")}点 足りません` : `${(total - rule.requiredTotal).toLocaleString("ja-JP")}点 多くなっています`}</p>}
    {correction && <label className="game-correction-reason">訂正理由（必須）<small>顧客の個人情報やパスワードなどの秘密情報は記載しないでください。</small><input name="reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} /></label>}
    {state.message && <p className="game-entry-error" role="alert">{state.message}</p>}
    {state.needsRefresh && <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>点数を控えて最新の画面を開く</button>}
    <div className="game-save-actions">
      {!correction && <button className="button button-primary game-submit" type="submit" name="afterSave" value="next" disabled={pending || !preview}>{pending ? "保存中…" : "保存して次の半荘へ"}</button>}
      <button className={`button ${correction ? "button-primary" : "button-secondary"} game-submit`} type="submit" name="afterSave" value="detail" disabled={pending || !preview}>{pending ? "保存中…" : correction ? "訂正版を保存" : "保存して結果を確認"}</button>
    </div>
    <p className="game-form-note">確定時にサーバー側でも参加者・点数・順位・成績点を再検証します。</p>
  </form>;
}

export function NewGameForm(props: { sessionId: string; sequence: number; idempotencyKey: string; seatingToken: string; players: Player[]; rule: GameRule }) {
  return <PointsEntry {...props} />;
}

export function CorrectGameForm(props: { sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule; initialPoints: Record<number, number>; gameId: string }) {
  return <PointsEntry {...props} correction={{ gameId: props.gameId }} initialPoints={props.initialPoints} />;
}
