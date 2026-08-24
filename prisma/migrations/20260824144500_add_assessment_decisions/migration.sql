-- Project Yoda: append-only human assessment decisions and sign-off history.
CREATE TABLE "AssessmentDecision" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "scoreRangeMin" DOUBLE PRECISION,
    "scoreRangeMax" DOUBLE PRECISION,
    "rationale" TEXT,
    "rubricVersion" INTEGER,
    "sourceEvidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePerspectiveIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssessmentDecision_capabilityId_createdAt_idx" ON "AssessmentDecision"("capabilityId", "createdAt");
CREATE INDEX "AssessmentDecision_supersedesId_idx" ON "AssessmentDecision"("supersedesId");
ALTER TABLE "AssessmentDecision" ADD CONSTRAINT "AssessmentDecision_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
