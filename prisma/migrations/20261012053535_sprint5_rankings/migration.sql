-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Preserve each result's original effective time; correction confirmation time remains separate.
UPDATE "Game" SET "effectiveAt" = "confirmedAt";

-- CreateTable
CREATE TABLE "RankingSettings" (
    "storeId" TEXT NOT NULL,
    "monthlyMinimumGames" INTEGER NOT NULL DEFAULT 10,
    "annualMinimumGames" INTEGER NOT NULL DEFAULT 30,
    "lifetimeMinimumGames" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RankingSettings_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE INDEX "Game_storeId_status_effectiveAt_idx" ON "Game"("storeId", "status", "effectiveAt");

-- AddForeignKey
ALTER TABLE "RankingSettings" ADD CONSTRAINT "RankingSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed additive per-store defaults for existing stores. Future stores create their settings with the store.
INSERT INTO "RankingSettings" ("storeId", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP FROM "Store"
ON CONFLICT ("storeId") DO NOTHING;
