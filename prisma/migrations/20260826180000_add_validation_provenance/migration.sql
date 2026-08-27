-- Preserve the evidence and perspective lineage for rating-validation proposals.
ALTER TABLE "MaturityProposal" ADD COLUMN "sourcePerspectiveIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
