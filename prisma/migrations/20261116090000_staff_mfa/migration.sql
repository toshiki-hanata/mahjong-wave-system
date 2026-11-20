BEGIN;

-- CreateEnum
CREATE TYPE "StaffMfaChallengeKind" AS ENUM ('ENROLL', 'VERIFY', 'REPLACE', 'ACKNOWLEDGE');

-- CreateTable
CREATE TABLE "StaffMfa" (
    "staffId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "secretCiphertext" TEXT,
    "enabledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastAcceptedStep" INTEGER,
    "recoveryCodeHashes" VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR(64)[],
    "enrollmentTokenHash" VARCHAR(64),
    "enrollmentExpiresAt" TIMESTAMPTZ(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "failureWindowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffMfa_pkey" PRIMARY KEY ("staffId")
);

-- CreateTable
CREATE TABLE "StaffMfaChallenge" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "kind" "StaffMfaChallengeKind" NOT NULL,
    "role" "Role" NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "mfaVersion" INTEGER NOT NULL,
    "secretCiphertext" TEXT,
    "recoveryCiphertext" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "ipBucketKey" VARCHAR(64),
    "loginBucketKey" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StaffMfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMfa_storeId_staffId_key" ON "StaffMfa"("storeId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMfaChallenge_tokenHash_key" ON "StaffMfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffMfaChallenge_storeId_staffId_expiresAt_idx" ON "StaffMfaChallenge"("storeId", "staffId", "expiresAt");

-- AddForeignKey
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_storeId_staffId_fkey" FOREIGN KEY ("storeId", "staffId") REFERENCES "Staff"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMfaChallenge" ADD CONSTRAINT "StaffMfaChallenge_storeId_staffId_fkey" FOREIGN KEY ("storeId", "staffId") REFERENCES "StaffMfa"("storeId", "staffId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "StaffMfa" ALTER COLUMN "recoveryCodeHashes" SET NOT NULL;
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_counters_check" CHECK ("version" >= 0 AND "failedAttempts" BETWEEN 0 AND 5 AND ("lastAcceptedStep" IS NULL OR "lastAcceptedStep" >= 0));
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_recovery_count_check" CHECK (cardinality("recoveryCodeHashes") BETWEEN 0 AND 10);
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_initial_state_check" CHECK ("enabledAt" IS NOT NULL OR ("secretCiphertext" IS NULL AND "lastAcceptedStep" IS NULL AND cardinality("recoveryCodeHashes") = 0));
ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_invitation_check" CHECK (("enrollmentTokenHash" IS NULL) = ("enrollmentExpiresAt" IS NULL) AND ("enabledAt" IS NULL OR "enrollmentTokenHash" IS NULL));
ALTER TABLE "StaffMfaChallenge" ADD CONSTRAINT "StaffMfaChallenge_lifetime_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '5 minutes' AND "mfaVersion" >= 0 AND "sessionVersion" >= 0);
ALTER TABLE "StaffMfaChallenge" ADD CONSTRAINT "StaffMfaChallenge_payload_check" CHECK (
  ("kind" IN ('ENROLL', 'REPLACE') AND "recoveryCiphertext" IS NULL AND "verifiedAt" IS NULL AND ("consumedAt" IS NOT NULL OR "secretCiphertext" IS NOT NULL)) OR
  ("kind" = 'VERIFY' AND "secretCiphertext" IS NULL AND "recoveryCiphertext" IS NULL AND "verifiedAt" IS NULL) OR
  ("kind" = 'ACKNOWLEDGE' AND "secretCiphertext" IS NULL AND "verifiedAt" IS NOT NULL AND ("consumedAt" IS NOT NULL OR "recoveryCiphertext" IS NOT NULL))
);

COMMIT;
