import type { PrismaClient } from "@prisma/client";
import { assertDatabaseTestEnvironment } from "./db-test-safety";

export async function assertConfiguredDatabaseTest(database: Pick<PrismaClient, "databaseTestMarker">): Promise<void> {
  await assertDatabaseTestEnvironment({
    enabled: Object.entries(process.env).some(([key, value]) => key.startsWith("RUN_") && key.endsWith("_DB_TESTS") && value === "true"),
    environmentId: process.env.DB_TEST_ENVIRONMENT_ID,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  }, async () => {
    const marker = await database.databaseTestMarker.findUnique({ where: { id: 1 }, select: { environmentId: true } });
    return marker?.environmentId ?? null;
  });
}
