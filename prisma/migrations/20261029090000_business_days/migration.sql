-- Additive migration. Historical visits/sessions/games deliberately remain unassigned.
BEGIN;
ALTER TABLE "Store" ADD COLUMN "freeGamePriceYen" INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE "Store" ADD CONSTRAINT "Store_freeGamePriceYen_check" CHECK ("freeGamePriceYen" BETWEEN 0 AND 1000000);

CREATE TABLE "BusinessDay" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "label" VARCHAR(10) NOT NULL,
  "timezone" TEXT NOT NULL,
  "freeGamePriceYen" INTEGER NOT NULL,
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ(3),
  "openedByStaffId" TEXT NOT NULL,
  "closedByStaffId" TEXT,
  CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessDay_price_check" CHECK ("freeGamePriceYen" BETWEEN 0 AND 1000000),
  CONSTRAINT "BusinessDay_close_check" CHECK (("closedAt" IS NULL AND "closedByStaffId" IS NULL) OR ("closedAt" >= "openedAt" AND "closedByStaffId" IS NOT NULL))
);
CREATE UNIQUE INDEX "BusinessDay_storeId_id_key" ON "BusinessDay"("storeId", "id");
CREATE UNIQUE INDEX "BusinessDay_storeId_requestKey_key" ON "BusinessDay"("storeId", "requestKey");
CREATE UNIQUE INDEX "BusinessDay_one_open_per_store_key" ON "BusinessDay"("storeId") WHERE "closedAt" IS NULL;
CREATE INDEX "BusinessDay_storeId_openedAt_idx" ON "BusinessDay"("storeId", "openedAt");
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_storeId_openedByStaffId_fkey" FOREIGN KEY ("storeId", "openedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_storeId_closedByStaffId_fkey" FOREIGN KEY ("storeId", "closedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Visit" ADD COLUMN "businessDayId" TEXT;
ALTER TABLE "TableSession" ADD COLUMN "businessDayId" TEXT;
ALTER TABLE "Game" ADD COLUMN "businessDayId" TEXT, ADD COLUMN "freeGamePriceYen" INTEGER;
ALTER TABLE "Game" ADD CONSTRAINT "Game_business_price_check" CHECK (("businessDayId" IS NULL AND "freeGamePriceYen" IS NULL) OR ("businessDayId" IS NOT NULL AND "freeGamePriceYen" IS NOT NULL AND "freeGamePriceYen" BETWEEN 0 AND 1000000));
CREATE INDEX "Visit_storeId_businessDayId_idx" ON "Visit"("storeId", "businessDayId");
CREATE INDEX "TableSession_storeId_businessDayId_idx" ON "TableSession"("storeId", "businessDayId");
CREATE INDEX "Game_storeId_businessDayId_status_idx" ON "Game"("storeId", "businessDayId", "status");
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_storeId_businessDayId_fkey" FOREIGN KEY ("storeId", "businessDayId") REFERENCES "BusinessDay"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
