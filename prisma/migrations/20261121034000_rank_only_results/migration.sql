BEGIN;
-- Preserve every existing point value. Unknown is NULL, never a synthetic zero.
ALTER TABLE "GamePlayerResult" ALTER COLUMN "finalPoints" DROP NOT NULL;
ALTER TABLE "GamePlayerResult" ALTER COLUMN "scoreScaled" DROP NOT NULL;
ALTER TABLE "GamePlayerResult" ADD CONSTRAINT "GamePlayerResult_score_availability_check"
  CHECK (("finalPoints" IS NULL) = ("scoreScaled" IS NULL));
COMMIT;
