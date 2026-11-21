BEGIN;
-- AlterTable
ALTER TABLE "CustomerAuthIdentity" ADD COLUMN     "recoveryVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CustomerPasskey" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "credentialId" VARCHAR(2048) NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" VARCHAR(20) NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "authenticatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "recoveryAcknowledgedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAuthChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "challenge" VARCHAR(256) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "storeId" TEXT,
    "customerId" TEXT,
    "authVersion" INTEGER,
    "pairingId" TEXT,
    "recoveryCodeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRecoveryCode" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CustomerRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPasskey_credentialId_key" ON "CustomerPasskey"("credentialId");

-- CreateIndex
CREATE INDEX "CustomerPasskey_storeId_customerId_revokedAt_idx" ON "CustomerPasskey"("storeId", "customerId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalSession_tokenHash_key" ON "CustomerPortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalSession_storeId_customerId_expiresAt_idx" ON "CustomerPortalSession"("storeId", "customerId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAuthChallenge_tokenHash_key" ON "CustomerAuthChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerAuthChallenge_expiresAt_idx" ON "CustomerAuthChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerAuthChallenge_storeId_customerId_kind_idx" ON "CustomerAuthChallenge"("storeId", "customerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRecoveryCode_codeHash_key" ON "CustomerRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "CustomerRecoveryCode_storeId_customerId_generation_idx" ON "CustomerRecoveryCode"("storeId", "customerId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRecoveryCode_storeId_customerId_id_key" ON "CustomerRecoveryCode"("storeId", "customerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPairing_storeId_customerId_id_key" ON "CustomerPairing"("storeId", "customerId", "id");

-- AddForeignKey
ALTER TABLE "CustomerPasskey" ADD CONSTRAINT "CustomerPasskey_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPasskey" ADD CONSTRAINT "CustomerPasskey_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "CustomerAuthIdentity"("storeId", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "CustomerAuthIdentity"("storeId", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerAuthChallenge" ADD CONSTRAINT "CustomerAuthChallenge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAuthChallenge" ADD CONSTRAINT "CustomerAuthChallenge_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "CustomerAuthIdentity"("storeId", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerAuthChallenge" ADD CONSTRAINT "CustomerAuthChallenge_storeId_customerId_pairingId_fkey" FOREIGN KEY ("storeId", "customerId", "pairingId") REFERENCES "CustomerPairing"("storeId", "customerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerAuthChallenge" ADD CONSTRAINT "CustomerAuthChallenge_storeId_customerId_recoveryCodeId_fkey" FOREIGN KEY ("storeId", "customerId", "recoveryCodeId") REFERENCES "CustomerRecoveryCode"("storeId", "customerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerRecoveryCode" ADD CONSTRAINT "CustomerRecoveryCode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRecoveryCode" ADD CONSTRAINT "CustomerRecoveryCode_storeId_customerId_fkey" FOREIGN KEY ("storeId", "customerId") REFERENCES "CustomerAuthIdentity"("storeId", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "CustomerPasskey" ADD CONSTRAINT "CustomerPasskey_values_check" CHECK ("counter" >= 0 AND char_length("credentialId") BETWEEN 1 AND 2048 AND "credentialId" ~ '^[A-Za-z0-9_-]+$' AND octet_length("publicKey") BETWEEN 1 AND 32768 AND char_length("label") BETWEEN 1 AND 80 AND "deviceType" IN ('singleDevice','multiDevice'));
ALTER TABLE "CustomerAuthIdentity" ADD CONSTRAINT "CustomerAuthIdentity_recovery_version_check" CHECK ("recoveryVersion" >= 0);
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_values_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$' AND "authVersion" >= 0 AND "expiresAt" > "createdAt" AND "expiresAt" > "authenticatedAt");
ALTER TABLE "CustomerAuthChallenge" ADD CONSTRAINT "CustomerAuthChallenge_values_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$' AND "challenge" ~ '^[A-Za-z0-9_-]+$' AND "expiresAt" > "createdAt" AND (("kind" = 'LOGIN' AND "storeId" IS NULL AND "customerId" IS NULL AND "authVersion" IS NULL AND "pairingId" IS NULL AND "recoveryCodeId" IS NULL) OR ("kind" IN ('ENROLL','ADD','RECOVER') AND "storeId" IS NOT NULL AND "customerId" IS NOT NULL AND "authVersion" IS NOT NULL AND "authVersion" >= 0 AND (("kind" = 'ENROLL' AND "pairingId" IS NOT NULL AND "recoveryCodeId" IS NULL) OR ("kind" = 'ADD' AND "pairingId" IS NULL AND "recoveryCodeId" IS NULL) OR ("kind" = 'RECOVER' AND "pairingId" IS NULL AND "recoveryCodeId" IS NOT NULL)))));
ALTER TABLE "CustomerRecoveryCode" ADD CONSTRAINT "CustomerRecoveryCode_values_check" CHECK ("codeHash" ~ '^[a-f0-9]{64}$' AND "generation" >= 0);
COMMIT;

ALTER TABLE "CustomerAuthIdentity" ADD COLUMN "recoveryAcknowledgedAt" TIMESTAMPTZ(3);
