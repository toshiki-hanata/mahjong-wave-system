import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

export const MAX_CUSTOMER_SEARCH_LENGTH = 100;

export function normalizeCustomerSearchTerm(query: string): string {
  return query.trim().slice(0, MAX_CUSTOMER_SEARCH_LENGTH);
}

export function buildCustomerSearchWhere(storeId: string, query: string, includeInactive = false): Prisma.CustomerWhereInput {
  const term = normalizeCustomerSearchTerm(query);
  return {
    storeId,
    participantStaffId: null,
    ...(includeInactive ? {} : { isActive: true }),
    ...(term ? {
      OR: [
        { customerCode: { contains: term, mode: "insensitive" } },
        { internalName: { contains: term, mode: "insensitive" } },
        { publicProfile: { is: { nickname: { contains: term, mode: "insensitive" } } } },
      ],
    } : {}),
  };
}

export async function searchCustomers(
  database: Pick<PrismaClient, "customer">,
  storeId: string,
  query: string,
  options: { includeInactive?: boolean; limit?: number } = {},
) {
  return database.customer.findMany({
    where: buildCustomerSearchWhere(storeId, query, options.includeInactive ?? false),
    orderBy: [{ internalName: "asc" }, { customerCode: "asc" }],
    take: options.limit ?? 100,
    select: {
      id: true,
      customerCode: true,
      internalName: true,
      isActive: true,
      createdAt: true,
      publicProfile: { select: { nickname: true, rankingOptIn: true, profileVisible: true } },
    },
  });
}

export async function getCustomerDetails(database: Pick<PrismaClient, "customer">, storeId: string, customerId: string) {
  return database.customer.findFirst({
    where: { id: customerId, storeId, participantStaffId: null },
    select: {
      id: true, customerCode: true, internalName: true, note: true,
      firstVisitAt: true, lastVisitAt: true, isActive: true, createdAt: true,
      publicProfile: { select: { nickname: true, rankingOptIn: true, profileVisible: true } },
    },
  });
}
