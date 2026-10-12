-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('WAITING', 'PLAYING', 'CHECKED_OUT');

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMPTZ(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_storeId_status_checkedInAt_idx" ON "Visit"("storeId", "status", "checkedInAt");

-- CreateIndex
CREATE INDEX "Visit_storeId_customerId_status_idx" ON "Visit"("storeId", "customerId", "status");

-- CreateIndex
CREATE INDEX "Visit_storeId_customerId_checkedInAt_idx" ON "Visit"("storeId", "customerId", "checkedInAt");

-- A customer may have only one open visit. Historical checked-out visits remain unlimited.
CREATE UNIQUE INDEX "Visit_one_open_per_store_customer_key"
ON "Visit"("storeId", "customerId")
WHERE "status" IN ('WAITING', 'PLAYING');

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
