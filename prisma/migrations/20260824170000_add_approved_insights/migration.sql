-- Project Yoda: approved, traceable insights derived from signed-off decisions.
CREATE TABLE "ApprovedInsight" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "sourceEvidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePerspectiveIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApprovedInsight_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovedInsight_capabilityId_createdAt_idx" ON "ApprovedInsight"("capabilityId", "createdAt");
CREATE INDEX "ApprovedInsight_decisionId_idx" ON "ApprovedInsight"("decisionId");
ALTER TABLE "ApprovedInsight" ADD CONSTRAINT "ApprovedInsight_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovedInsight" ADD CONSTRAINT "ApprovedInsight_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AssessmentDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
