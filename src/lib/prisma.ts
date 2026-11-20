import "server-only";
import { createHash } from "node:crypto";
import { runtimeDatabaseUrl } from "@/lib/security/database-config";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConnectionKey?: string;
};

const connectionUrl = runtimeDatabaseUrl();
// Do not reuse a pre-MFA generated client during a development hot reload.
const connectionKey = createHash("sha256").update(connectionUrl ?? "").update("\0qr-reception-client-v1").digest("hex");

/** Do not connect until a validated DATABASE_URL is supplied. */
export const prisma =
  (globalForPrisma.prismaConnectionKey === connectionKey ? globalForPrisma.prisma : undefined) ??
  (connectionUrl ? new PrismaClient({ datasourceUrl: connectionUrl, errorFormat: "minimal", log: [] }) : null);

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaConnectionKey = connectionKey;
}
