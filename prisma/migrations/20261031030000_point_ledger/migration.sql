BEGIN;
CREATE TYPE "PointEntryKind" AS ENUM ('ADJUST', 'REVERSE');
CREATE TABLE "PointLedgerEntry" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "actorStaffId" TEXT NOT NULL,
  "kind" "PointEntryKind" NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "requestKey" VARCHAR(36) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "reversesEntryId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PointLedgerEntry_values_check" CHECK (
    "delta" <> 0 AND "balanceAfter" >= 0 AND "sequenceNumber" > 0
    AND length(btrim("reason")) > 0
    AND (("kind" = 'ADJUST' AND "reversesEntryId" IS NULL) OR ("kind" = 'REVERSE' AND "reversesEntryId" IS NOT NULL))
  )
);
CREATE UNIQUE INDEX "PointLedgerEntry_storeId_requestKey_key" ON "PointLedgerEntry"("storeId", "requestKey");
CREATE UNIQUE INDEX "PointLedgerEntry_storeId_customerId_id_key" ON "PointLedgerEntry"("storeId", "customerId", "id");
CREATE UNIQUE INDEX "PointLedgerEntry_storeId_customerId_sequenceNumber_key" ON "PointLedgerEntry"("storeId", "customerId", "sequenceNumber");
CREATE UNIQUE INDEX "PointLedgerEntry_storeId_customerId_reversesEntryId_key" ON "PointLedgerEntry"("storeId", "customerId", "reversesEntryId");
CREATE INDEX "PointLedgerEntry_storeId_customerId_createdAt_idx" ON "PointLedgerEntry"("storeId", "customerId", "createdAt");
ALTER TABLE "PointLedgerEntry" ADD CONSTRAINT "PointLedgerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointLedgerEntry" ADD CONSTRAINT "PointLedgerEntry_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointLedgerEntry" ADD CONSTRAINT "PointLedgerEntry_storeId_actorStaffId_fkey" FOREIGN KEY ("storeId", "actorStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointLedgerEntry" ADD CONSTRAINT "PointLedgerEntry_storeId_customerId_reversesEntryId_fkey" FOREIGN KEY ("storeId", "customerId", "reversesEntryId") REFERENCES "PointLedgerEntry"("storeId", "customerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE FUNCTION deny_point_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Point ledger entries are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "PointLedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "PointLedgerEntry" FOR EACH ROW EXECUTE FUNCTION deny_point_ledger_mutation();
COMMIT;
