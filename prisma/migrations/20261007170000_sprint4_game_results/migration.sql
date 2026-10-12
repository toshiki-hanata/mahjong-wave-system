-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('CONFIRMED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "TieBreakRule" AS ENUM ('POSITION_ASC');

-- CreateEnum
CREATE TYPE "ScoreRoundingMode" AS ENUM ('NONE', 'HALF_UP', 'DOWN');

-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "storeRuleId" TEXT;

-- CreateTable
CREATE TABLE "StoreRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "startingPoints" INTEGER NOT NULL,
    "returnPoints" INTEGER NOT NULL,
    "umaFirst" INTEGER NOT NULL,
    "umaSecond" INTEGER NOT NULL,
    "umaThird" INTEGER NOT NULL,
    "umaFourth" INTEGER NOT NULL,
    "okaTop" INTEGER NOT NULL,
    "pointUnit" INTEGER NOT NULL,
    "requiredTotal" INTEGER NOT NULL,
    "allowNegative" BOOLEAN NOT NULL,
    "tieBreakRule" "TieBreakRule" NOT NULL,
    "scorePrecision" INTEGER NOT NULL,
    "roundingMode" "ScoreRoundingMode" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "storeRuleId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "GameStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotencyKey" TEXT NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "playedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedAt" TIMESTAMPTZ(3),
    "correctionReason" TEXT,
    "correctedByGameId" TEXT,
    "correctedByStaffId" TEXT,
    "createdByStaffId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayerResult" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "finalPoints" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "scoreScaled" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayerResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreRule_storeId_isActive_version_idx" ON "StoreRule"("storeId", "isActive", "version");

-- CreateIndex
CREATE UNIQUE INDEX "StoreRule_storeId_id_key" ON "StoreRule"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StoreRule_storeId_version_key" ON "StoreRule"("storeId", "version");

-- CreateIndex
CREATE INDEX "Game_storeId_tableSessionId_sequenceNumber_status_idx" ON "Game"("storeId", "tableSessionId", "sequenceNumber", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Game_storeId_id_key" ON "Game"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Game_storeId_correctedByGameId_key" ON "Game"("storeId", "correctedByGameId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_storeId_tableSessionId_sequenceNumber_revisionNumber_key" ON "Game"("storeId", "tableSessionId", "sequenceNumber", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Game_storeId_tableSessionId_idempotencyKey_key" ON "Game"("storeId", "tableSessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GamePlayerResult_storeId_customerId_createdAt_idx" ON "GamePlayerResult"("storeId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "GamePlayerResult_storeId_gameId_idx" ON "GamePlayerResult"("storeId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerResult_storeId_gameId_visitId_key" ON "GamePlayerResult"("storeId", "gameId", "visitId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerResult_storeId_gameId_customerId_key" ON "GamePlayerResult"("storeId", "gameId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerResult_storeId_gameId_position_key" ON "GamePlayerResult"("storeId", "gameId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerResult_storeId_gameId_rank_key" ON "GamePlayerResult"("storeId", "gameId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_id_key" ON "Customer"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_storeId_id_key" ON "Staff"("storeId", "id");

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_storeRuleId_fkey" FOREIGN KEY ("storeId", "storeRuleId") REFERENCES "StoreRule"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreRule" ADD CONSTRAINT "StoreRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreRule" ADD CONSTRAINT "StoreRule_storeId_createdByStaffId_fkey" FOREIGN KEY ("storeId", "createdByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_tableSessionId_fkey" FOREIGN KEY ("storeId", "tableSessionId") REFERENCES "TableSession"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_storeRuleId_fkey" FOREIGN KEY ("storeId", "storeRuleId") REFERENCES "StoreRule"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_createdByStaffId_fkey" FOREIGN KEY ("storeId", "createdByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_correctedByStaffId_fkey" FOREIGN KEY ("storeId", "correctedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_correctedByGameId_fkey" FOREIGN KEY ("storeId", "correctedByGameId") REFERENCES "Game"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_storeId_gameId_fkey" FOREIGN KEY ("storeId", "gameId") REFERENCES "Game"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_storeId_visitId_fkey" FOREIGN KEY ("storeId", "visitId") REFERENCES "Visit"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provisional development rule only. Existing TableSessions remain NULL until their first Game is recorded.
INSERT INTO "StoreRule" (
  "id", "storeId", "version", "startingPoints", "returnPoints",
  "umaFirst", "umaSecond", "umaThird", "umaFourth", "okaTop",
  "pointUnit", "requiredTotal", "allowNegative", "tieBreakRule",
  "scorePrecision", "roundingMode", "isActive", "createdAt"
)
SELECT
  'sprint4_initial_rule_' || s."id", s."id", 1, 25000, 30000,
  20, 10, -10, -20, 20, 100, 100000, true,
  'POSITION_ASC'::"TieBreakRule", 1, 'NONE'::"ScoreRoundingMode", true, CURRENT_TIMESTAMP
FROM "Store" s;

CREATE UNIQUE INDEX "StoreRule_one_active_per_store_key"
  ON "StoreRule"("storeId") WHERE "isActive" = true;

CREATE UNIQUE INDEX "Game_one_confirmed_per_sequence_key"
  ON "Game"("storeId", "tableSessionId", "sequenceNumber") WHERE "status" = 'CONFIRMED';

ALTER TABLE "StoreRule"
  ADD CONSTRAINT "StoreRule_positive_rule_values_check"
  CHECK ("startingPoints" > 0 AND "returnPoints" > 0 AND "pointUnit" > 0 AND "requiredTotal" > 0 AND "scorePrecision" BETWEEN 0 AND 3);

ALTER TABLE "Game"
  ADD CONSTRAINT "Game_positive_sequence_revision_check"
  CHECK ("sequenceNumber" > 0 AND "revisionNumber" > 0),
  ADD CONSTRAINT "Game_correction_state_check"
  CHECK (("status" = 'CONFIRMED' AND "correctedByGameId" IS NULL AND "correctedAt" IS NULL AND "correctionReason" IS NULL)
      OR ("status" = 'CORRECTED' AND "correctedByGameId" IS NOT NULL AND "correctedAt" IS NOT NULL AND length(trim("correctionReason")) > 0));

ALTER TABLE "GamePlayerResult"
  ADD CONSTRAINT "GamePlayerResult_position_range_check" CHECK ("position" BETWEEN 1 AND 4),
  ADD CONSTRAINT "GamePlayerResult_rank_range_check" CHECK ("rank" BETWEEN 1 AND 4);
