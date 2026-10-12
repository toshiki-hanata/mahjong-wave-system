"use client";

import { useActionState } from "react";
import { createStoreRuleAction } from "@/app/admin/(protected)/games/actions";
import type { GameActionState } from "@/app/admin/(protected)/games/actions";

const initial: GameActionState = {};
const umaFields: Array<["umaFirst" | "umaSecond" | "umaThird" | "umaFourth", string, number]> = [["umaFirst", "1位", 20], ["umaSecond", "2位", 10], ["umaThird", "3位", -10], ["umaFourth", "4位", -20]];

export function StoreRuleForm({ current }: { current?: { startingPoints: number; returnPoints: number; umaFirst: number; umaSecond: number; umaThird: number; umaFourth: number; okaTop: number; pointUnit: number; requiredTotal: number; allowNegative: boolean; tieBreakRule: "POSITION_ASC"; scorePointDivisor: number; scorePrecision: number; roundingMode: "NONE" | "HALF_UP" | "DOWN"; isProvisional: boolean } }) {
  const [state, action, pending] = useActionState(createStoreRuleAction, initial);
  return <form action={action} className="store-rule-form">
    <label>開始持ち点<input type="number" name="startingPoints" min="1" required defaultValue={current?.startingPoints ?? 25000} /></label>
    <label>返し点<input type="number" name="returnPoints" min="1" required defaultValue={current?.returnPoints ?? 30000} /></label>
    <fieldset><legend>順位ウマ</legend>{umaFields.map(([name, label, provisional]) => <label key={name}>{label}<input type="number" name={name} required defaultValue={current?.[name] ?? provisional} /></label>)}</fieldset>
    <label>トップのオカ<input type="number" name="okaTop" required defaultValue={current?.okaTop ?? 20} /></label>
    <label>点数入力単位<input type="number" name="pointUnit" min="1" required defaultValue={current?.pointUnit ?? 100} /></label>
    <label>4人合計点<input type="number" name="requiredTotal" min="1" required defaultValue={current?.requiredTotal ?? 100000} /></label>
    <label className="store-rule-checkbox"><input type="checkbox" name="allowNegative" defaultChecked={current?.allowNegative ?? true} />マイナス点を許可</label>
    <label className="store-rule-checkbox"><input type="checkbox" name="isProvisional" defaultChecked={current?.isProvisional ?? true} />暫定ルールとして扱う</label>
    <label>同点処理<select name="tieBreakRule" defaultValue={current?.tieBreakRule ?? "POSITION_ASC"}><option value="POSITION_ASC">物理positionが小さい方を上位</option></select></label>
    <label>scoreの点数除数<input type="number" name="scorePointDivisor" min="1" required defaultValue={current?.scorePointDivisor ?? 1000} /></label>
    <label>score小数桁<input type="number" name="scorePrecision" min="0" max="3" required defaultValue={current?.scorePrecision ?? 1} /></label>
    <label>端数処理<select name="roundingMode" defaultValue={current?.roundingMode ?? "NONE"}><option value="NONE">端数なし（発生時は拒否）</option><option value="HALF_UP">四捨五入</option><option value="DOWN">ゼロ方向へ切り捨て</option></select></label>
    <p className="store-rule-warning">保存すると新しいversionを作成します。過去のルール値と、開始済みSessionのルールは上書きしません。</p>
    <button className="button button-primary" disabled={pending}>{pending ? "保存中…" : "新しいルールversionを作成"}</button>
    {state.message && <p className={`table-action-notice${state.success ? " is-success" : ""}`} role="status">{state.message}</p>}
  </form>;
}
