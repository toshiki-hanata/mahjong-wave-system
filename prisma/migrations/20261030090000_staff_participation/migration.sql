BEGIN;
ALTER TABLE "Customer" ADD COLUMN "participantStaffId" TEXT;
CREATE UNIQUE INDEX "Customer_storeId_participantStaffId_key"
  ON "Customer"("storeId", "participantStaffId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_participantStaffId_fkey"
  FOREIGN KEY ("storeId", "participantStaffId") REFERENCES "Staff"("storeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
