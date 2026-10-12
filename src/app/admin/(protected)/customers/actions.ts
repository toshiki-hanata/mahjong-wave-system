"use server";

import { Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireStaff } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { createCustomer, deactivateCustomer, updateCustomer } from "@/features/customers/customer-service";
import { customerCreateSchema, customerUpdateSchema, formBoolean } from "@/features/customers/schemas";

export type CustomerFormState = { message?: string; fieldErrors?: Record<string, string[]> };

function rawValues(formData: FormData) {
  return {
    customerCode: formData.get("customerCode"),
    internalName: formData.get("internalName"),
    note: formData.get("note") ?? "",
    nickname: formData.get("nickname") ?? "",
    rankingOptIn: formBoolean(formData.get("rankingOptIn")),
    profileVisible: formBoolean(formData.get("profileVisible")),
  };
}

function validationState(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): CustomerFormState {
  return { message: "入力内容を確認してください。", fieldErrors: Object.fromEntries(Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Boolean(entry[1]))) };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function uniqueViolationMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = JSON.stringify(error.meta?.target ?? "");
    if (target.includes("customerCode")) return "この店舗では同じ顧客コードを登録できません。";
  }
  return "一意制約により保存できませんでした。入力内容を確認して再度お試しください。";
}

export async function createCustomerAction(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const staff = await requireStaff();
  const parsed = customerCreateSchema.safeParse(rawValues(formData));
  if (!parsed.success) return validationState(parsed.error);
  if (!prisma) return { message: "DATABASE_URLが設定されていないため、保存できません。" };
  let id: string;
  try {
    id = await createCustomer(prisma, parsed.data, { storeId: staff.storeId, staffId: staff.id });
  } catch (error) {
    if (isUniqueViolation(error)) return { message: uniqueViolationMessage(error) };
    throw error;
  }
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}`);
}

export async function updateCustomerAction(customerId: string, _previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const staff = await requireStaff();
  const parsed = customerUpdateSchema.safeParse(rawValues(formData));
  if (!parsed.success) return validationState(parsed.error);
  if (!prisma) return { message: "DATABASE_URLが設定されていないため、保存できません。" };
  try {
    const updated = await updateCustomer(prisma, customerId, parsed.data, { storeId: staff.storeId, staffId: staff.id });
    if (!updated) return { message: "顧客が見つかりません。" };
  } catch (error) {
    if (isUniqueViolation(error)) return { message: uniqueViolationMessage(error) };
    throw error;
  }
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  redirect(`/admin/customers/${customerId}`);
}

export async function deactivateCustomerAction(formData: FormData): Promise<void> {
  const staff = await requireRole([Role.OWNER, Role.MANAGER]);
  const customerId = formData.get("customerId");
  if (typeof customerId !== "string" || !customerId || !prisma) redirect("/admin/customers");
  const deactivated = await deactivateCustomer(prisma, customerId, { storeId: staff.storeId, staffId: staff.id });
  if (deactivated) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
  }
  redirect(`/admin/customers/${customerId}`);
}
