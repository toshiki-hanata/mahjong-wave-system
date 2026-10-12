-- The database default records the exact result-confirmation time; no game-start time is inferred.
ALTER TABLE "Game" RENAME COLUMN "playedAt" TO "confirmedAt";
