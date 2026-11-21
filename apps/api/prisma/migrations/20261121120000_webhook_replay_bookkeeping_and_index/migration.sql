-- Recorded-delivery replay: retry bookkeeping, and the index the query needs.
--
-- A replay that failed used to write `processingError` — the column the sweep
-- reads as "the live handler already rejected this payload" — so one transient
-- deadlock or dropped connection parked a real capture for good. Replay failures
-- now have their own fields and are retried on the next sweep; `processingError`
-- stays the live handler's verdict, and is the only reason a recorded delivery is
-- skipped.

ALTER TABLE "WebhookEvent"
  ADD COLUMN "replayAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "replayError" TEXT,
  ADD COLUMN "lastReplayAttemptAt" TIMESTAMP(3);

-- The replay selects one provider's unprocessed rows inside a seven-day window,
-- oldest first. Until now the only index on this table was (eventType, createdAt),
-- so that query read every delivery ever received.
CREATE INDEX "WebhookEvent_provider_processedAt_createdAt_idx"
  ON "WebhookEvent" ("provider", "processedAt", "createdAt");