BEGIN;
ALTER TABLE "BusinessDay" DROP CONSTRAINT "BusinessDay_close_check";
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_close_check" CHECK (
  ("closedAt" IS NULL AND "closedByStaffId" IS NULL)
  OR ("closedAt" IS NOT NULL AND "closedAt" >= "openedAt" AND "closedByStaffId" IS NOT NULL)
);
COMMIT;
