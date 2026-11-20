BEGIN;
-- CreateEnum
CREATE TYPE "QrReceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "QrReceptionSetting" (
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QrReceptionSetting_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "QrReceptionRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "stationRevision" INTEGER NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "submittedName" VARCHAR(120) NOT NULL,
    "receiptCode" VARCHAR(8) NOT NULL,
    "status" "QrReceptionStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT,
    "visitId" TEXT,
    "reviewedByStaffId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QrReceptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QrReceptionRequest_tokenHash_key" ON "QrReceptionRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "QrReceptionRequest_storeId_status_expiresAt_idx" ON "QrReceptionRequest"("storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "QrReceptionRequest_storeId_businessDayId_createdAt_idx" ON "QrReceptionRequest"("storeId", "businessDayId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QrReceptionRequest_businessDayId_receiptCode_key" ON "QrReceptionRequest"("businessDayId", "receiptCode");

-- AddForeignKey
ALTER TABLE "QrReceptionSetting" ADD CONSTRAINT "QrReceptionSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_storeId_visitId_fkey" FOREIGN KEY ("storeId", "visitId") REFERENCES "Visit"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_storeId_reviewedByStaffId_fkey" FOREIGN KEY ("storeId", "reviewedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "QrReceptionSetting" ADD CONSTRAINT "QrReceptionSetting_revision_check" CHECK ("revision" >= 1);
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_values_check" CHECK ("stationRevision" >= 1 AND char_length("submittedName") BETWEEN 1 AND 120 AND "tokenHash" ~ '^[a-f0-9]{64}$' AND "receiptCode" ~ '^[A-F0-9]{8}$' AND "expiresAt" > "createdAt");
ALTER TABLE "QrReceptionRequest" ADD CONSTRAINT "QrReceptionRequest_review_check" CHECK (("status" = 'PENDING' AND "reviewedByStaffId" IS NULL AND "reviewedAt" IS NULL AND "customerId" IS NULL AND "visitId" IS NULL) OR ("status" = 'REJECTED' AND "reviewedByStaffId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "customerId" IS NULL AND "visitId" IS NULL) OR ("status" = 'APPROVED' AND "reviewedByStaffId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "customerId" IS NOT NULL AND "visitId" IS NOT NULL));
COMMIT;
