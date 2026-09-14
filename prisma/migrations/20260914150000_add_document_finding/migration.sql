-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "FindingStrength" AS ENUM ('NONE', 'WEAK', 'MODERATE', 'STRONG');

-- CreateTable
CREATE TABLE "DocumentFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "capturedInputId" TEXT NOT NULL,
    "documentType" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "capabilityId" TEXT,
    "capabilityName" TEXT,
    "evidenceDemonstrated" TEXT,
    "strength" "FindingStrength" NOT NULL DEFAULT 'NONE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "citedSegmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "citedExcerpts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "FindingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "sourceHash" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentFinding_organizationId_status_idx" ON "DocumentFinding"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DocumentFinding_capturedInputId_idx" ON "DocumentFinding"("capturedInputId");

-- CreateIndex
CREATE INDEX "DocumentFinding_capabilityId_idx" ON "DocumentFinding"("capabilityId");

-- AddForeignKey
ALTER TABLE "DocumentFinding" ADD CONSTRAINT "DocumentFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFinding" ADD CONSTRAINT "DocumentFinding_capturedInputId_fkey" FOREIGN KEY ("capturedInputId") REFERENCES "CapturedInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
