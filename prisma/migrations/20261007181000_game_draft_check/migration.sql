-- Update the check to allow transaction-local DRAFT replacement rows. No rows are removed.
ALTER TABLE "Game" DROP CONSTRAINT "Game_correction_state_check";
ALTER TABLE "Game"
  ADD CONSTRAINT "Game_correction_state_check"
  CHECK (("status" = 'DRAFT' AND "correctedByGameId" IS NULL AND "correctedAt" IS NULL AND "correctionReason" IS NULL)
      OR ("status" = 'CONFIRMED' AND "correctedByGameId" IS NULL AND "correctedAt" IS NULL AND "correctionReason" IS NULL)
      OR ("status" = 'CORRECTED' AND "correctedByGameId" IS NOT NULL AND "correctedAt" IS NOT NULL AND length(trim("correctionReason")) > 0));
