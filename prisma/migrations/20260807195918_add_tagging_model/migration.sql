-- CreateEnum
CREATE TYPE "TagTargetType" AS ENUM ('DOMAIN', 'CAPABILITY', 'KPI', 'STAKEHOLDER');

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('AUTO_APPROVED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REASSIGNED');

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "targetType" "TagTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "TagStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tag_targetType_targetId_idx" ON "Tag"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CapturedSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
