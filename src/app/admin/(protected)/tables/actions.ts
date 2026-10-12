"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { tableManagementRoles, tableOperationRoles } from "@/features/tables/table-permissions";
import { InvalidVisitTransitionError, VisitCustomerUnavailableError } from "@/features/visits/visit-service";
import { createTableSchema, deactivateTableSchema, endTableSessionSchema, startTableSessionSchema, updateTableSchema } from "@/features/tables/table-schemas";
import { createTable, deactivateTable, endTableSession, InvalidSeatAssignmentError, InvalidTableSessionStateError, startTableSession, StoreRuleUnavailableError, TableHasActiveSessionError, TableNotAvailableError, TableSessionConflictError, TableSessionNotFoundError, updateTable } from "@/features/tables/table-service";

export type TableActionState = { message?: string; success?: boolean };

function revalidateTables() {
  revalidatePath("/admin/tables");
  revalidatePath("/admin");
}

export async function createTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const staff = await requireRole(tableManagementRoles);
  const parsed = createTableSchema.safeParse({ name: formData.get("name"), sortOrder: Number(formData.get("sortOrder") ?? 0) });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try { await createTable(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { message: "同じ名前の卓がすでにあります。" };
    throw error;
  }
  revalidateTables();
  return { success: true, message: "卓を追加しました。" };
}

export async function updateTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const staff = await requireRole(tableManagementRoles);
  const parsed = updateTableSchema.safeParse({ tableId: formData.get("tableId"), name: formData.get("name"), sortOrder: Number(formData.get("sortOrder")) });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try {
    const updated = await updateTable(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    if (!updated) return { message: "卓が見つかりません。" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { message: "同じ名前の卓がすでにあります。" };
    throw error;
  }
  revalidateTables();
  return { success: true, message: "卓情報を更新しました。" };
}

export async function deactivateTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const staff = await requireRole(tableManagementRoles);
  const parsed = deactivateTableSchema.safeParse({ tableId: formData.get("tableId") });
  if (!parsed.success) return { message: "卓が見つかりません。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try {
    const deactivated = await deactivateTable(prisma, parsed.data.tableId, { storeId: staff.storeId, staffId: staff.id });
    if (!deactivated) return { message: "有効な卓が見つかりません。" };
  } catch (error) {
    if (error instanceof TableHasActiveSessionError) return { message: "稼働中の卓は無効化できません。先に卓を解放してください。" };
    throw error;
  }
  revalidateTables();
  return { success: true, message: "卓を無効化しました。" };
}

export async function startTableSessionAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const staff = await requireRole(tableOperationRoles);
  const parsed = startTableSessionSchema.safeParse({
    tableId: formData.get("tableId"),
    seats: [1, 2, 3, 4].map((position) => ({ position, visitId: formData.get(`visitId${position}`) })),
  });
  if (!parsed.success) return { message: "異なる来店中顧客を4人選択してください。席番号は1〜4を指定します。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try { await startTableSession(prisma, parsed.data.tableId, parsed.data.seats, { storeId: staff.storeId, staffId: staff.id }); }
  catch (error) {
    if (error instanceof TableNotAvailableError) return { message: "有効な空き卓が見つかりません。" };
    if (error instanceof TableSessionConflictError) return { message: "卓または選択した顧客はすでに使用中です。最新の状態を確認してください。" };
    if (error instanceof InvalidSeatAssignmentError) return { message: "席と4人の選択を確認してください。" };
    if (error instanceof VisitCustomerUnavailableError) return { message: "無効になった顧客は卓へ配置できません。" };
    if (error instanceof InvalidVisitTransitionError) return { message: "選択した来店は待機中ではありません。最新の状態を読み込んでください。" };
    if (error instanceof StoreRuleUnavailableError) return { message: "有効な半荘ルールがありません。OWNER/MANAGERがルールを登録してください。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { message: "顧客の状態または席割当を確認できません。最新の状態を読み込み直してください。" };
    throw error;
  }
  revalidateTables();
  return { success: true, message: "4人で卓を開始しました。" };
}

export async function endTableSessionAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const staff = await requireRole(tableOperationRoles);
  const parsed = endTableSessionSchema.safeParse({ sessionId: formData.get("sessionId") });
  if (!parsed.success) return { message: "稼働中の卓を確認できません。" };
  if (!prisma) return { message: "データベースへ接続できません。" };
  try { await endTableSession(prisma, parsed.data.sessionId, { storeId: staff.storeId, staffId: staff.id }); }
  catch (error) {
    if (error instanceof TableSessionNotFoundError) return { message: "稼働中の卓が見つかりません。" };
    if (error instanceof InvalidTableSessionStateError) return { message: "卓の状態が変わっています。最新の状態を読み込んでください。" };
    if (error instanceof InvalidVisitTransitionError) return { message: "4人の来店状態が想定と異なります。卓を解放できませんでした。" };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { message: "4人の状態を確認できず、卓を解放できませんでした。" };
    throw error;
  }
  revalidateTables();
  return { success: true, message: "卓を解放し、4人を待機中へ戻しました。" };
}
