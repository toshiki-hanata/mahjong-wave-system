import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit-log";

export const DEFAULT_RANKING_SETTINGS = {
  monthlyMinimumGames: 10,
  annualMinimumGames: 30,
  lifetimeMinimumGames: 30,
} as const;

export const rankingSettingsSchema = z.object({
  monthlyMinimumGames: z.coerce.number().int().min(1).max(100_000),
  annualMinimumGames: z.coerce.number().int().min(1).max(100_000),
  lifetimeMinimumGames: z.coerce.number().int().min(1).max(100_000),
});

export type RankingSettingsInput = z.infer<typeof rankingSettingsSchema>;
type Database = Pick<PrismaClient, "$transaction" | "rankingSettings">;

export async function getRankingSettings(database: Pick<PrismaClient, "rankingSettings"> | null, storeId: string) {
  if (!database) return { ...DEFAULT_RANKING_SETTINGS };
  const settings = await database.rankingSettings.findUnique({ where: { storeId } });
  return settings ?? { storeId, ...DEFAULT_RANKING_SETTINGS };
}

export async function updateRankingSettings(
  database: Database,
  input: RankingSettingsInput,
  context: { storeId: string; staffId: string },
) {
  return database.$transaction(async (tx) => {
    const settings = await tx.rankingSettings.upsert({
      where: { storeId: context.storeId },
      create: { storeId: context.storeId, ...input },
      update: input,
    });
    await recordAuditLog({
      storeId: context.storeId,
      actorStaffId: context.staffId,
      action: "RANKING_SETTINGS_UPDATE",
      entityType: "RankingSettings",
      entityId: context.storeId,
      metadata: input,
    }, tx);
    return settings;
  });
}
