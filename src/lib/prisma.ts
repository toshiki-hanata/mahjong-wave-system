import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/** Do not connect until DATABASE_URL is supplied by the deployment environment. */
export const prisma =
  globalForPrisma.prisma ??
  (process.env.DATABASE_URL ? new PrismaClient() : null);

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}
