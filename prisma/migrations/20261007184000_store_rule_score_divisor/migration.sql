-- Make the score point divisor part of the versioned StoreRule configuration.
-- Existing rules receive the provisional divisor without changing their prior results.
ALTER TABLE "StoreRule"
  ADD COLUMN "scorePointDivisor" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "StoreRule"
  ADD CONSTRAINT "StoreRule_score_point_divisor_check"
  CHECK ("scorePointDivisor" > 0);
