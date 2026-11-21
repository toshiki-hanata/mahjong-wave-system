-- CreateTable
CREATE TABLE "LegacyPointMigration" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPointMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPointChange" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "migrationId" TEXT NOT NULL,
    "actorStaffId" TEXT NOT NULL,
    "requestKey" VARCHAR(36) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "source" VARCHAR(12) NOT NULL,
    "previousAmount" INTEGER NOT NULL,
    "importedAmount" INTEGER NOT NULL,
    "expectedBalance" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "ledgerEntryId" TEXT,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPointChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointMigration_storeId_customerId_key" ON "LegacyPointMigration"("storeId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointMigration_storeId_customerId_id_key" ON "LegacyPointMigration"("storeId", "customerId", "id");

-- CreateIndex
CREATE INDEX "LegacyPointChange_storeId_customerId_createdAt_idx" ON "LegacyPointChange"("storeId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointChange_storeId_requestKey_key" ON "LegacyPointChange"("storeId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointChange_ledgerEntryId_key" ON "LegacyPointChange"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointChange_storeId_customerId_ledgerEntryId_key" ON "LegacyPointChange"("storeId", "customerId", "ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPointChange_storeId_customerId_migrationId_revision_key" ON "LegacyPointChange"("storeId", "customerId", "migrationId", "revision");

-- AddForeignKey
ALTER TABLE "LegacyPointMigration" ADD CONSTRAINT "LegacyPointMigration_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPointChange" ADD CONSTRAINT "LegacyPointChange_storeId_customerId_migrationId_fkey" FOREIGN KEY ("storeId", "customerId", "migrationId") REFERENCES "LegacyPointMigration"("storeId", "customerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "LegacyPointChange" ADD CONSTRAINT "LegacyPointChange_storeId_actorStaffId_fkey" FOREIGN KEY ("storeId", "actorStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPointChange" ADD CONSTRAINT "LegacyPointChange_storeId_customerId_ledgerEntryId_fkey" FOREIGN KEY ("storeId", "customerId", "ledgerEntryId") REFERENCES "PointLedgerEntry"("storeId", "customerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "LegacyPointChange" ADD CONSTRAINT "LegacyPointChange_amounts_check" CHECK ("previousAmount" >= 0 AND "importedAmount" >= 0 AND "expectedBalance" >= 0 AND "revision" >= 1 AND "kind" IN ('INITIAL', 'CORRECT') AND "source" IN ('VISUAL', 'NO_CARD'));
