-- CreateEnum
CREATE TYPE "LoginRateLimitDimension" AS ENUM ('IP', 'LOGIN_ID');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoginAttemptBucket" (
    "id" TEXT NOT NULL,
    "bucketKey" VARCHAR(64) NOT NULL,
    "dimension" "LoginRateLimitDimension" NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginAttemptBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseTestMarker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "environmentId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatabaseTestMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttemptBucket_bucketKey_key" ON "LoginAttemptBucket"("bucketKey");

-- CreateIndex
CREATE INDEX "LoginAttemptBucket_windowStartedAt_idx" ON "LoginAttemptBucket"("windowStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatabaseTestMarker_environmentId_key" ON "DatabaseTestMarker"("environmentId");
