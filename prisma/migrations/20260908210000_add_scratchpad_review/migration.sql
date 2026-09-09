CREATE TYPE "ScratchpadReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
ALTER TABLE "CapturedInput" ADD COLUMN "reviewStatus" "ScratchpadReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "CapturedInput" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN "reviewedAt" TIMESTAMP(3);
