"use client";
import { participantName, participantCode } from "@/features/staff-participation/participant-policy";
import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { calculateGame, scoreForDisplay, type GameRule } from "./game-calculation";
import { createGameAction, correctGameAction, type GameFormState } from "@/app/admin/(protected)/games/actions";
const subscribe = () => () => {}, ready = () => true, notReady = () => false;
type Player = { position: number; visitId: string; customerId: string; customer: { internalName: string; participantStaffId?: string | null; customerCode: string } };
type Props = { sessionId: string; sequence: number; idempotencyKey: string; players: Player[]; rule: GameRule; seatingToken?: string; initialPoints?: Record<number, number | null>; initialRanks?: Record<number, number>; correction?: { gameId: string } };
function ResultsEntry({ sessionId, sequence, idempotencyKey, players, rule, initialPoints, initialRanks, correction, seatingToken }: Props) {
  const hydrated = useSyncExternalStore(subscribe, ready, notReady);
  const [requestKey] = useState(idempotencyKey), [reason, setReason] = useState("");
  const [inputMode, setInputMode] = useState<"POINTS" | "RANK_ONLY">(correction && initialPoints && Object.values(initialPoints).every(p => p === null) ? "RANK_ONLY" : "POINTS");
  const [points, setPoints] = useState<Record<number, string>>(Object.fromEntries([1, 2, 3, 4].map(p => [p, initialPoints?.[p]?.toString() ?? ""])));
  const [places, setPlaces] = useState<Record<number, string>>(Object.fromEntries([1, 2, 3, 4].map(rank => [rank, String(Object.entries(initialRanks ?? {}).find(([, r]) => r === rank)?.[0] ?? "")])));
  const [state, action, pending] = useActionState(correction ? correctGameAction : createGameAction, {} as GameFormState);
  const locked = pending || !hydrated;
  const calculation = useMemo(() => {
    if ([1, 2, 3, 4].some(p => points[p] === "" || !Number.isInteger(Number(points[p])))) return { results: null, error: "4人の持ち点を整数で入力してください。" };
    try { return { results: calculateGame(players.map(p => ({ ...p, finalPoints: Number(points[p.position]) })), rule), error: null }; }
    catch (e) { return { results: null, error: e instanceof Error ? e.message : "点数を確認してください。" }; }
  }, [players, points, rule]);
  const ranksValid = [1, 2, 3, 4].every(r => players.some(p => String(p.position) === places[r])) && new Set(Object.values(places)).size === 4;
  const valid = inputMode === "POINTS" ? Boolean(calculation.results) : ranksValid;
  const total = [1, 2, 3, 4].reduce((n, p) => n + (Number(points[p]) || 0), 0);
  return <form action={action} className="game-entry-form">
    <input type="hidden" name="idempotencyKey" value={requestKey} /><input type="hidden" name="inputMode" value={inputMode} />
    {!correction && <><input type="hidden" name="seatingToken" value={seatingToken} /><input type="hidden" name="expectedSequence" value={sequence} /></>}
    {correction ? <input type="hidden" name="gameId" value={correction.gameId} /> : <input type="hidden" name="tableSessionId" value={sessionId} />}
    <div className="game-input-mode" role="group" aria-label="半荘結果の入力方法"><button type="button" aria-pressed={inputMode === "POINTS"} disabled={locked} onClick={() => setInputMode("POINTS")}>点数を入力</button><button type="button" aria-pressed={inputMode === "RANK_ONLY"} disabled={locked} onClick={() => setInputMode("RANK_ONLY")}>着順だけ入力</button></div>
    {!hydrated && <p className="game-entry-hint" role="status">入力の準備中です…</p>}
    {inputMode === "POINTS" ? <>
      <div className="game-point-grid">{[...players].sort((a, b) => a.position - b.position).map(player => {
        const result = calculation.results?.find(r => r.position === player.position);
        return <label className="game-player-input" key={player.position}><span className="game-position">座席 {player.position}</span><strong>{participantName(player.customer)}</strong><small>{participantCode(player.customer)}</small>
          <input name={`points${player.position}`} type="number" inputMode="decimal" step={rule.pointUnit} required disabled={locked} value={points[player.position]} onChange={e => setPoints(p => ({ ...p, [player.position]: e.target.value }))} aria-label={`座席${player.position}の最終持ち点`} />
          {rule.allowNegative && <button className="game-sign-toggle" type="button" disabled={locked || !points[player.position] || !Number(points[player.position])} onClick={() => setPoints(p => ({ ...p, [player.position]: String(-Number(p[player.position])) }))}>{Number(points[player.position]) < 0 ? "プラスにする" : "マイナスにする"}</button>}
          {result && <span className="game-preview">{result.rank}位 · {scoreForDisplay(result.scoreScaled, rule.scorePrecision)} pt</span>}</label>;
      })}</div>
      <div className={`game-total${total === rule.requiredTotal ? " is-valid" : ""}`}><span>合計点</span><strong>{total.toLocaleString("ja-JP")} / {rule.requiredTotal.toLocaleString("ja-JP")}</strong><small>{rule.pointUnit}点単位・マイナス点{rule.allowNegative ? "可" : "不可"}</small></div>
      {calculation.error && <p className="game-entry-hint" role="status">{calculation.error}</p>}
      {Object.values(points).some(Boolean) && total !== rule.requiredTotal && <p className="game-entry-hint" role="status">{total < rule.requiredTotal ? `あと ${(rule.requiredTotal - total).toLocaleString("ja-JP")}点 足りません` : `${(total - rule.requiredTotal).toLocaleString("ja-JP")}点 多くなっています`}</p>}
      {calculation.results && <section className="game-ordered-preview" aria-label="着順プレビュー"><h3>1位から4位の結果</h3><ol>{calculation.results.map(r => <li key={r.position}><b>{r.rank}位</b><span>{participantName(players.find(p => p.position === r.position)!.customer)}</span><span>{r.finalPoints.toLocaleString("ja-JP")}点</span></li>)}</ol></section>}
    </> : <>
      <p className="game-rank-note">点数が分からなくても保存できます。本数・順位の成績・売上に反映し、点数とスコアは未入力として集計から除外します。</p>
      <div className="game-rank-inputs">{[1, 2, 3, 4].map(rank => <label key={rank}><b>{rank}位</b><select name={`rankPosition${rank}`} aria-label={`${rank}位のお客さん`} required disabled={locked} value={places[rank]} onChange={e => setPlaces(p => ({ ...p, [rank]: e.target.value }))}><option value="">参加者を選択</option>{players.map(p => <option key={p.position} value={p.position} disabled={Object.entries(places).some(([r, position]) => Number(r) !== rank && position === String(p.position))}>{participantName(p.customer)}（座席{p.position}）</option>)}</select></label>)}</div>
      {!ranksValid && <p className="game-entry-hint" role="status">1位から4位まで、異なる4人を選んでください。</p>}
    </>}
    {correction && <label className="game-correction-reason">訂正理由（必須）<small>顧客の個人情報やパスワードなどの秘密情報は記載しないでください。</small><input name="reason" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={locked} /></label>}
    {state.message && <p className="game-entry-error" role="alert">{state.message}</p>}
    {state.needsRefresh && <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>入力を控えて最新の画面を開く</button>}
    <div className="game-save-actions">{!correction && <button className="button button-primary game-submit" type="submit" name="afterSave" value="next" disabled={locked || !valid}>{pending ? "保存中…" : "保存して次の半荘へ"}</button>}<button className={`button ${correction ? "button-primary" : "button-secondary"} game-submit`} type="submit" name="afterSave" value="detail" disabled={locked || !valid}>{pending ? "保存中…" : correction ? "訂正版を保存" : "保存して結果を確認"}</button></div>
    <p className="game-form-note">確定時にサーバー側でも参加者・入力内容・着順を再検証します。点数の追加入力・訂正は責任者が履歴を残して行います。</p>
  </form>;
}
export function NewGameForm(props: Props & { seatingToken: string }) { return <ResultsEntry {...props} />; }
export function CorrectGameForm(props: Props & { gameId: string; initialPoints: Record<number, number | null>; initialRanks: Record<number, number> }) { return <ResultsEntry {...props} correction={{ gameId: props.gameId }} />; }
