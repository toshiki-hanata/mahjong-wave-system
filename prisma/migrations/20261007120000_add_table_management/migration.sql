-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "MahjongTable" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MahjongTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mahjongTableId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSeat" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MahjongTable_storeId_isActive_sortOrder_idx" ON "MahjongTable"("storeId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MahjongTable_storeId_name_key" ON "MahjongTable"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MahjongTable_storeId_id_key" ON "MahjongTable"("storeId", "id");

-- CreateIndex
CREATE INDEX "TableSession_storeId_status_startedAt_idx" ON "TableSession"("storeId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "TableSession_storeId_mahjongTableId_status_idx" ON "TableSession"("storeId", "mahjongTableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_storeId_id_key" ON "TableSession"("storeId", "id");

-- CreateIndex
CREATE INDEX "TableSeat_storeId_tableSessionId_removedAt_idx" ON "TableSeat"("storeId", "tableSessionId", "removedAt");

-- CreateIndex
CREATE INDEX "TableSeat_storeId_visitId_removedAt_idx" ON "TableSeat"("storeId", "visitId", "removedAt");

-- CreateIndex
CREATE INDEX "TableSeat_storeId_tableSessionId_position_idx" ON "TableSeat"("storeId", "tableSessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_storeId_id_key" ON "Visit"("storeId", "id");

-- A table has at most one active session.
CREATE UNIQUE INDEX "TableSession_one_active_per_table_key"
ON "TableSession"("storeId", "mahjongTableId")
WHERE "status" = 'ACTIVE';

-- An active seat assignment cannot reuse a Visit or a physical position.
CREATE UNIQUE INDEX "TableSeat_one_active_per_visit_key"
ON "TableSeat"("storeId", "visitId")
WHERE "removedAt" IS NULL;

CREATE UNIQUE INDEX "TableSeat_one_active_per_position_key"
ON "TableSeat"("storeId", "tableSessionId", "position")
WHERE "removedAt" IS NULL;

ALTER TABLE "TableSeat"
ADD CONSTRAINT "TableSeat_position_range_check" CHECK ("position" BETWEEN 1 AND 4);

-- AddForeignKey
ALTER TABLE "MahjongTable" ADD CONSTRAINT "MahjongTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_storeId_mahjongTableId_fkey" FOREIGN KEY ("storeId", "mahjongTableId") REFERENCES "MahjongTable"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSeat" ADD CONSTRAINT "TableSeat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSeat" ADD CONSTRAINT "TableSeat_storeId_tableSessionId_fkey" FOREIGN KEY ("storeId", "tableSessionId") REFERENCES "TableSession"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSeat" ADD CONSTRAINT "TableSeat_storeId_visitId_fkey" FOREIGN KEY ("storeId", "visitId") REFERENCES "Visit"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
