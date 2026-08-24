-- Project Yoda: append-only human assessment decisions and sign-off history.
CREATE TABLE "MaturityDecision" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "locationTag" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approvedScore" DOUBLE PRECISION,
    "scoreRangeMin" DOUBLE PRECISION,
    "scoreRangeMax" DOUBLE PRECISION,
    "rationale" TEXT NOT NULL,
    "supportingPerspectiveIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "conflictingPerspectiveIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "supportingEvidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reviewerEmail" TEXT NOT NULL,
    "approverEmail" TEXT,
    "supersedesDecisionId" TEXT,
    "followUpOwner" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaturityDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaturityDecision_capabilityId_locationTag_createdAt_idx" ON "MaturityDecision"("capabilityId", "locationTag", "createdAt");
CREATE INDEX "MaturityDecision_supersedesDecisionId_idx" ON "MaturityDecision"("supersedesDecisionId");
ALTER TABLE "MaturityDecision" ADD CONSTRAINT "MaturityDecision_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
