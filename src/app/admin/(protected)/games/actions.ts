"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createGame, createStoreRuleVersion, correctGame, GameEntryChangedError, GameIdempotencyConflictError, GameNotCorrectableError, GameRuleUnavailableError, GameSeatIntegrityError, GameSessionUnavailableError } from "@/features/games/game-service";
import { gameCorrectionSchema, gameInputSchema, storeRuleSchema } from "@/features/games/game-schemas";
import { gameCorrectionRoles, gameEntryRoles, storeRuleRoles } from "@/features/games/game-permissions";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { BusinessDayClosedError } from "@/features/business-days/business-day-service";
import { InvalidFinalPointsError } from "@/features/games/game-calculation";

export type GameActionState = { message?: string; success?: boolean };
export type GameFormState = { message?: string; needsRefresh?: boolean };

function pointInputs(formData: FormData) {
  return [1, 2, 3, 4].map((position) => {
    const raw = formData.get(`points${position}`);
    return { position, finalPoints: raw === null || raw === "" ? Number.NaN : Number(raw) };
  });
}

export async function createStoreRuleAction(_previous: GameActionState, formData: FormData): Promise<GameActionState> {
  const staff = await requireRole(storeRuleRoles);
  const parsed = storeRuleSchema.safeParse({
    startingPoints: formData.get("startingPoints"), returnPoints: formData.get("returnPoints"),
    umaFirst: formData.get("umaFirst"), umaSecond: formData.get("umaSecond"), umaThird: formData.get("umaThird"), umaFourth: formData.get("umaFourth"),
    okaTop: formData.get("okaTop"), pointUnit: formData.get("pointUnit"), requiredTotal: formData.get("requiredTotal"),
    allowNegative: formData.get("allowNegative") === "on", tieBreakRule: formData.get("tieBreakRule"),
    scorePointDivisor: formData.get("scorePointDivisor"),
    scorePrecision: formData.get("scorePrecision"), roundingMode: formData.get("roundingMode"),
    isProvisional: formData.get("isProvisional") === "on",
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try {
    const version = await createStoreRuleVersion(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    revalidatePath("/admin/store-rules"); revalidatePath("/admin/tables");
    return { success: true, message: `ルールversion ${version}を作成しました。既存Sessionには反映されません。` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { message: "ルールの保存に失敗しました。画面を更新してください。" };
    throw error;
  }
}

function gameFormError(error: unknown): GameFormState {
  if (error instanceof InvalidFinalPointsError) return { message: error.message };
  if (error instanceof BusinessDayClosedError) return { message: "営業を開始してから入力してください。", needsRefresh: true };
  if (error instanceof GameEntryChangedError) return { message: "席・参加者または半荘番号が変わりました。点数は保持しています。控えてから最新の画面を確認してください。", needsRefresh: true };
  if (error instanceof GameSessionUnavailableError) return { message: "この卓の利用は終了しているか、営業が変わっています。入力した点数を控え、卓画面を確認してください。", needsRefresh: true };
  if (error instanceof GameSeatIntegrityError) return { message: "参加者の来店状態が変わっています。入力した点数を控え、卓画面を確認してください。", needsRefresh: true };
  if (error instanceof GameRuleUnavailableError) return { message: "半荘ルールを確認できません。管理者に確認してください。" };
  if (error instanceof GameIdempotencyConflictError) return { message: "この送信は別の内容で処理済みです。点数を控えて履歴を確認してください。", needsRefresh: true };
  if (error instanceof GameNotCorrectableError) return { message: "この結果はすでに訂正されています。最新の訂正版を確認してください。", needsRefresh: true };
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) return { message: "保存できませんでした。点数は保持しています。接続状態を確認して再度お試しください。" };
  throw error;
}

export async function createGameAction(_previous: GameFormState, formData: FormData): Promise<GameFormState> {
  const staff = await requireRole(gameEntryRoles);
  const parsed = gameInputSchema.safeParse({ tableSessionId: formData.get("tableSessionId"), idempotencyKey: formData.get("idempotencyKey"), expectedSequence: formData.get("expectedSequence"), seatingToken: formData.get("seatingToken"), points: pointInputs(formData) });
  if (!parsed.success) return { message: "4人の持ち点と入力画面を確認してください。点数は保持しています。" };
  if (!prisma) return { message: "データベースへ接続できません。点数は保持しています。" };
  let result;
  try {
    result = await createGame(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) { return gameFormError(error); }
  revalidatePath("/admin", "layout");
  if (formData.get("afterSave") === "next") redirect(`/admin/tables/${parsed.data.tableSessionId}/games/new?saved=${result.sequenceNumber}`);
  redirect(`/admin/tables/${parsed.data.tableSessionId}/games/${result.id}`);
}

export async function correctGameAction(_previous: GameFormState, formData: FormData): Promise<GameFormState> {
  const staff = await requireRole(gameCorrectionRoles);
  const parsed = gameCorrectionSchema.safeParse({ gameId: formData.get("gameId"), idempotencyKey: formData.get("idempotencyKey"), reason: formData.get("reason"), points: pointInputs(formData) });
  if (!parsed.success) return { message: "持ち点と訂正理由を確認してください。入力は保持しています。" };
  if (!prisma) return { message: "データベースへ接続できません。入力は保持しています。" };
  let result;
  let sessionId: string;
  try {
    const original = await prisma.game.findFirst({ where: { id: parsed.data.gameId, storeId: staff.storeId }, select: { tableSessionId: true } });
    if (!original) return { message: "対局が見つかりません。", needsRefresh: true };
    sessionId = original.tableSessionId;
    result = await correctGame(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) { return gameFormError(error); }
  revalidatePath("/admin", "layout");
  redirect(`/admin/tables/${sessionId}/games/${result.id}`);
}
