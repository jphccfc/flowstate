-- Project Yoda: provisional AI maturity proposals with explicit human review.
CREATE TABLE "MaturityProposal" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "suggestedScore" DOUBLE PRECISION,
    "scoreRangeMin" DOUBLE PRECISION,
    "scoreRangeMax" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "missingEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflictingEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceEvidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaturityProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaturityProposal_capabilityId_status_createdAt_idx" ON "MaturityProposal"("capabilityId", "status", "createdAt");
ALTER TABLE "MaturityProposal" ADD CONSTRAINT "MaturityProposal_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
