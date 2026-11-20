import { scoreForDisplay } from "./game-calculation";
export function finalPointsLabel(value: number | null): string { return value === null ? "点数未入力" : `${value.toLocaleString("ja-JP")}点`; }
export function gameScoreLabel(value: number | null, precision: number): string { return value === null ? "スコア未入力" : `${scoreForDisplay(value, precision)} pt`; }
