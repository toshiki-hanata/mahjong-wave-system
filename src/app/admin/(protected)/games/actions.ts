"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createGame, createStoreRuleVersion, correctGame, GameIdempotencyConflictError, GameNotCorrectableError, GameRuleUnavailableError, GameSeatIntegrityError, GameSessionUnavailableError } from "@/features/games/game-service";
import { gameCorrectionSchema, gameInputSchema, storeRuleSchema } from "@/features/games/game-schemas";
import { gameCorrectionRoles, gameEntryRoles, storeRuleRoles } from "@/features/games/game-permissions";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";

export type GameActionState = { message?: string; success?: boolean };

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

export async function createGameAction(formData: FormData): Promise<never> {
  const staff = await requireRole(gameEntryRoles);
  const parsed = gameInputSchema.safeParse({ tableSessionId: formData.get("tableSessionId"), idempotencyKey: formData.get("idempotencyKey"), points: pointInputs(formData) });
  if (!parsed.success) redirect(`/admin/tables?error=invalid-game-input`);
  if (!prisma) redirect(`/admin/tables?error=database`);
  try {
    const result = await createGame(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    revalidatePath(`/admin/tables/${parsed.data.tableSessionId}/games`); revalidatePath("/admin/tables"); revalidatePath("/admin");
    redirect(`/admin/tables/${parsed.data.tableSessionId}/games/${result.id}`);
  } catch (error) {
    if (error instanceof GameSessionUnavailableError) redirect(`/admin/tables?error=session-unavailable`);
    if (error instanceof GameSeatIntegrityError) redirect(`/admin/tables?error=seat-integrity`);
    if (error instanceof GameRuleUnavailableError) redirect(`/admin/store-rules?error=rule-unavailable`);
    if (error instanceof GameIdempotencyConflictError) redirect(`/admin/tables?error=idempotency-conflict`);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) redirect(`/admin/tables?error=game-conflict`);
    throw error;
  }
}

export async function correctGameAction(formData: FormData): Promise<never> {
  const staff = await requireRole(gameCorrectionRoles);
  const parsed = gameCorrectionSchema.safeParse({ gameId: formData.get("gameId"), idempotencyKey: formData.get("idempotencyKey"), reason: formData.get("reason"), points: pointInputs(formData) });
  if (!parsed.success) redirect(`/admin/tables?error=invalid-correction`);
  if (!prisma) redirect(`/admin/tables?error=database`);
  try {
    const result = await correctGame(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    revalidatePath("/admin/tables"); revalidatePath("/admin");
    const original = await prisma.game.findFirst({ where: { id: parsed.data.gameId, storeId: staff.storeId }, select: { tableSessionId: true } });
    if (!original) redirect(`/admin/tables?error=game-not-found`);
    revalidatePath(`/admin/tables/${original.tableSessionId}/games`);
    redirect(`/admin/tables/${original.tableSessionId}/games/${result.id}`);
  } catch (error) {
    if (error instanceof GameNotCorrectableError) redirect(`/admin/tables?error=not-correctable`);
    if (error instanceof GameSeatIntegrityError) redirect(`/admin/tables?error=seat-integrity`);
    if (error instanceof GameIdempotencyConflictError) redirect(`/admin/tables?error=idempotency-conflict`);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) redirect(`/admin/tables?error=game-conflict`);
    throw error;
  }
}
