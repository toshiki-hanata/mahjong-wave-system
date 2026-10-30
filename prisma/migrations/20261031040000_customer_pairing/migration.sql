BEGIN;
CREATE TABLE "CustomerAuthIdentity" (
 "id" TEXT NOT NULL PRIMARY KEY, "storeId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
 "userHandle" VARCHAR(64) NOT NULL, "activatedAt" TIMESTAMPTZ(3), "authVersion" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CustomerAuthIdentity_version_check" CHECK ("authVersion" >= 0)
);
CREATE UNIQUE INDEX "CustomerAuthIdentity_userHandle_key" ON "CustomerAuthIdentity"("userHandle");
CREATE UNIQUE INDEX "CustomerAuthIdentity_storeId_customerId_key" ON "CustomerAuthIdentity"("storeId", "customerId");
CREATE UNIQUE INDEX "CustomerAuthIdentity_storeId_id_key" ON "CustomerAuthIdentity"("storeId", "id");
ALTER TABLE "CustomerAuthIdentity" ADD CONSTRAINT "CustomerAuthIdentity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAuthIdentity" ADD CONSTRAINT "CustomerAuthIdentity_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "CustomerPairing" (
 "id" TEXT NOT NULL PRIMARY KEY, "storeId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
 "issuedByStaffId" TEXT NOT NULL, "confirmedByStaffId" TEXT, "requestKey" VARCHAR(36) NOT NULL,
 "tokenHash" VARCHAR(64) NOT NULL, "claimHash" VARCHAR(64), "confirmationCode" VARCHAR(6), "failedClaims" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "claimedAt" TIMESTAMPTZ(3), "staffConfirmedAt" TIMESTAMPTZ(3), "customerConfirmedAt" TIMESTAMPTZ(3),
 "completedAt" TIMESTAMPTZ(3), "cancelledAt" TIMESTAMPTZ(3),
 CONSTRAINT "CustomerPairing_state_check" CHECK (
   "expiresAt" > "createdAt" AND "failedClaims" >= 0
   AND (("claimedAt" IS NULL AND "claimHash" IS NULL AND "confirmationCode" IS NULL) OR ("claimedAt" IS NOT NULL AND "claimHash" IS NOT NULL AND "confirmationCode" IS NOT NULL))
   AND ("staffConfirmedAt" IS NULL OR ("claimedAt" IS NOT NULL AND "confirmedByStaffId" IS NOT NULL))
   AND ("customerConfirmedAt" IS NULL OR "claimedAt" IS NOT NULL)
   AND ("completedAt" IS NULL OR ("staffConfirmedAt" IS NOT NULL AND "customerConfirmedAt" IS NOT NULL AND "cancelledAt" IS NULL))
 )
);
CREATE UNIQUE INDEX "CustomerPairing_tokenHash_key" ON "CustomerPairing"("tokenHash");
CREATE UNIQUE INDEX "CustomerPairing_claimHash_key" ON "CustomerPairing"("claimHash");
CREATE UNIQUE INDEX "CustomerPairing_storeId_requestKey_key" ON "CustomerPairing"("storeId", "requestKey");
CREATE UNIQUE INDEX "CustomerPairing_one_pending_per_customer" ON "CustomerPairing"("storeId", "customerId") WHERE "cancelledAt" IS NULL AND "completedAt" IS NULL;
CREATE INDEX "CustomerPairing_storeId_customerId_createdAt_idx" ON "CustomerPairing"("storeId", "customerId", "createdAt");
CREATE INDEX "CustomerPairing_storeId_issuedByStaffId_createdAt_idx" ON "CustomerPairing"("storeId", "issuedByStaffId", "createdAt");
ALTER TABLE "CustomerPairing" ADD CONSTRAINT "CustomerPairing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPairing" ADD CONSTRAINT "CustomerPairing_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "Customer"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPairing" ADD CONSTRAINT "CustomerPairing_identity_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "CustomerAuthIdentity"("storeId", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPairing" ADD CONSTRAINT "CustomerPairing_storeId_issuedByStaffId_fkey" FOREIGN KEY ("storeId", "issuedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPairing" ADD CONSTRAINT "CustomerPairing_storeId_confirmedByStaffId_fkey" FOREIGN KEY ("storeId", "confirmedByStaffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
