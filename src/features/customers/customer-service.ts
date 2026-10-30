import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";
import type { CustomerCreateInput, CustomerUpdateInput } from "./schemas";
import { lockBusinessStore } from "@/features/business-days/business-day-service";

type TransactionDatabase = Pick<PrismaClient, "$transaction">;

export function createPublicId(): string {
  return randomBytes(18).toString("base64url");
}

export async function createCustomer(
  database: TransactionDatabase,
  input: CustomerCreateInput,
  context: { storeId: string; staffId: string },
): Promise<string> {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const customer = await tx.customer.create({
      data: {
        storeId: context.storeId,
        customerCode: input.customerCode,
        internalName: input.internalName,
        note: input.note,
      },
      select: { id: true },
    });
    const profile = input.rankingOptIn ? await tx.publicProfile.create({ data: {
      customerId: customer.id, publicId: createPublicId(), nickname: input.nickname,
      rankingOptIn: true, profileVisible: input.profileVisible,
    }, select: { id: true } }) : null;

    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_CREATE",
      entityType: "Customer", entityId: customer.id,
      metadata: { changedFields: ["customerCode", "internalName", "note"] },
    }, tx);
    if (profile) {
      await recordAuditLog({
        storeId: context.storeId, actorStaffId: context.staffId, action: "PUBLIC_PROFILE_UPDATE",
        entityType: "PublicProfile", entityId: profile.id,
        metadata: { changedFields: ["nickname", "rankingOptIn", "profileVisible"], operation: "create" },
      }, tx);
    }
    return customer.id;
  });
}

export async function updateCustomer(
  database: TransactionDatabase,
  customerId: string,
  input: CustomerUpdateInput,
  context: { storeId: string; staffId: string },
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const current = await tx.customer.findFirst({
      where: { id: customerId, storeId: context.storeId },
      select: { id: true, publicProfile: { select: { id: true, nickname: true } } },
    });
    if (!current) return false;

    await tx.customer.update({
      where: { id: current.id },
      data: { customerCode: input.customerCode, internalName: input.internalName, note: input.note },
      select: { id: true },
    });
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_UPDATE",
      entityType: "Customer", entityId: current.id,
      metadata: { changedFields: ["customerCode", "internalName", "note"] },
    }, tx);

    let profileId: string | null = null;
    if (current.publicProfile) {
      await tx.publicProfile.update({
        where: { customerId: current.id },
        data: {
          nickname: input.nickname || current.publicProfile.nickname,
          rankingOptIn: input.rankingOptIn,
          profileVisible: input.profileVisible,
        },
      });
      profileId = current.publicProfile.id;
    } else if (input.rankingOptIn) {
      const profile = await tx.publicProfile.create({ data: {
        customerId: current.id,
        publicId: createPublicId(),
        nickname: input.nickname,
        rankingOptIn: true,
        profileVisible: input.profileVisible,
      }, select: { id: true } });
      profileId = profile.id;
    }

    if (profileId) {
      await recordAuditLog({
        storeId: context.storeId, actorStaffId: context.staffId, action: "PUBLIC_PROFILE_UPDATE",
        entityType: "PublicProfile", entityId: profileId,
        metadata: { changedFields: ["nickname", "rankingOptIn", "profileVisible"] },
      }, tx);
    }
    return true;
  });
}

export async function deactivateCustomer(
  database: TransactionDatabase,
  customerId: string,
  context: { storeId: string; staffId: string },
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    await lockBusinessStore(tx, context.storeId);
    const customer = await tx.customer.findFirst({
      where: { id: customerId, storeId: context.storeId, isActive: true },
      select: { id: true },
    });
    if (!customer) return false;
    await tx.customer.update({ where: { id: customer.id }, data: { isActive: false } });
    await recordAuditLog({
      storeId: context.storeId, actorStaffId: context.staffId, action: "CUSTOMER_DEACTIVATE",
      entityType: "Customer", entityId: customer.id,
      metadata: { changedFields: ["isActive"], value: false },
    }, tx);
    return true;
  });
}

export type PublicProfileDTO = Pick<Prisma.PublicProfileGetPayload<{ select: {
  publicId: true; nickname: true; avatarUrl: true;
} }>, "publicId" | "nickname" | "avatarUrl">;

export function projectPublicProfile(profile: { publicId: string; nickname: string; avatarUrl: string | null }): PublicProfileDTO {
  return { publicId: profile.publicId, nickname: profile.nickname, avatarUrl: profile.avatarUrl };
}

export async function getPublicProfileById(database: Pick<PrismaClient, "publicProfile"> | null, publicId: string): Promise<PublicProfileDTO | null> {
  if (!database) return null;
  const profile = await database.publicProfile.findFirst({
    where: {
      publicId,
      rankingOptIn: true,
      profileVisible: true,
      customer: { is: { isActive: true } },
    },
    select: { publicId: true, nickname: true, avatarUrl: true },
  });
  return profile ? projectPublicProfile(profile) : null;
}
