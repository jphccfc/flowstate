-- Forward-only repair for deployments where the application schema advanced
-- without the corresponding CapturedInput migration columns.
DO $$
BEGIN
  CREATE TYPE "ScratchpadReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "meetingContextId" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "senderEmail" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "quarantineReason" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "reviewStatus" "ScratchpadReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CapturedInput_meetingContextId_idx" ON "CapturedInput"("meetingContextId");
