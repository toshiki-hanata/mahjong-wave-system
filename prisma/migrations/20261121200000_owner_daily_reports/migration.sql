BEGIN;
-- CreateTable
CREATE TABLE "DailyReportWorker" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "hourlyRateYen" INTEGER NOT NULL,
    "roundingMode" VARCHAR(12) NOT NULL,
    "nightRateBps" INTEGER NOT NULL DEFAULT 2500,
    "overtimeRateBps" INTEGER NOT NULL DEFAULT 2500,
    "holidayRateBps" INTEGER NOT NULL DEFAULT 3500,
    "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyReportWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportShift" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerName" VARCHAR(80) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "breaks" JSONB NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "statutoryHoliday" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" VARCHAR(300),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyReportShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportCashEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "workerId" TEXT,
    "workerName" VARCHAR(80),
    "kind" VARCHAR(24) NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "requestKey" VARCHAR(36) NOT NULL,
    "operation" VARCHAR(24) NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReportWorker_storeId_isActive_name_idx" ON "DailyReportWorker"("storeId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportWorker_storeId_id_key" ON "DailyReportWorker"("storeId", "id");

-- CreateIndex
CREATE INDEX "DailyReportShift_storeId_businessDayId_startedAt_idx" ON "DailyReportShift"("storeId", "businessDayId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyReportShift_storeId_workerId_startedAt_idx" ON "DailyReportShift"("storeId", "workerId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportShift_storeId_id_key" ON "DailyReportShift"("storeId", "id");

-- CreateIndex
CREATE INDEX "DailyReportCashEntry_storeId_businessDayId_occurredAt_idx" ON "DailyReportCashEntry"("storeId", "businessDayId", "occurredAt");

-- CreateIndex
CREATE INDEX "DailyReportCashEntry_storeId_businessDayId_workerId_kind_idx" ON "DailyReportCashEntry"("storeId", "businessDayId", "workerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportCashEntry_storeId_id_key" ON "DailyReportCashEntry"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportRequest_storeId_requestKey_key" ON "DailyReportRequest"("storeId", "requestKey");

-- AddForeignKey
ALTER TABLE "DailyReportWorker" ADD CONSTRAINT "DailyReportWorker_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportShift" ADD CONSTRAINT "DailyReportShift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportShift" ADD CONSTRAINT "DailyReportShift_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportShift" ADD CONSTRAINT "DailyReportShift_storeId_workerId_fkey" FOREIGN KEY ("storeId", "workerId") REFERENCES "DailyReportWorker"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportCashEntry" ADD CONSTRAINT "DailyReportCashEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportCashEntry" ADD CONSTRAINT "DailyReportCashEntry_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportCashEntry" ADD CONSTRAINT "DailyReportCashEntry_storeId_workerId_fkey" FOREIGN KEY ("storeId", "workerId") REFERENCES "DailyReportWorker"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportRequest" ADD CONSTRAINT "DailyReportRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportRequest" ADD CONSTRAINT "DailyReportRequest_storeId_staffId_fkey" FOREIGN KEY ("storeId", "staffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DailyReportWorker" ADD CONSTRAINT "DailyReportWorker_values_check" CHECK ("hourlyRateYen" BETWEEN 1 AND 100000 AND "roundingMode" IN ('EXACT','CEIL_15') AND "nightRateBps" BETWEEN 2500 AND 30000 AND "overtimeRateBps" BETWEEN 2500 AND 30000 AND "holidayRateBps" BETWEEN 3500 AND 30000 AND "overtimeAfterMinutes" BETWEEN 60 AND 480 AND "revision" > 0);
ALTER TABLE "DailyReportShift" ADD CONSTRAINT "DailyReportShift_values_check" CHECK ("revision" > 0 AND (("voidedAt" IS NULL) = ("voidReason" IS NULL)) AND ("endedAt" IS NULL OR ("endedAt" > "startedAt" AND "endedAt" <= "startedAt" + INTERVAL '48 hours')));
ALTER TABLE "DailyReportCashEntry" ADD CONSTRAINT "DailyReportCashEntry_values_check" CHECK ("amountYen" BETWEEN 1 AND 100000000 AND "kind" IN ('SET_SALE','DRINK_SALE','OTHER_SALE','OTHER_IN','STAFF_OUT','STAFF_RETURN','PAYROLL_PAID','STORE_EXPENSE','EVENT_EXPENSE','SERVICE_REFUND','OTHER_OUT') AND (("kind" IN ('STAFF_OUT','STAFF_RETURN','PAYROLL_PAID')) = ("workerId" IS NOT NULL)) AND (("voidedAt" IS NULL) = ("voidReason" IS NULL)));
ALTER TABLE "DailyReportRequest" ADD CONSTRAINT "DailyReportRequest_hash_check" CHECK ("inputHash" ~ '^[a-f0-9]{64}$');
COMMIT;
