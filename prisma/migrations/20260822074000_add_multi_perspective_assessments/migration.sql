-- Project Yoda: append-only stakeholder and expert maturity perspectives.
-- This is an incremental migration for environments that already contain the
-- Flowstate baseline schema. Existing MaturityAssessment history is preserved.

CREATE TABLE "MaturityRubric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "anchors" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaturityRubric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaturityPerspective" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "stakeholderId" TEXT,
    "assessorEmail" TEXT,
    "stakeholderType" TEXT NOT NULL,
    "assessorRole" TEXT,
    "locationTag" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreRangeMin" DOUBLE PRECISION,
    "scoreRangeMax" DOUBLE PRECISION,
    "originalStatement" TEXT NOT NULL,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourceEvidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rubricVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaturityPerspective_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaturityRubric_organizationId_name_version_key"
    ON "MaturityRubric"("organizationId", "name", "version");
CREATE INDEX "MaturityRubric_organizationId_isDefault_idx"
    ON "MaturityRubric"("organizationId", "isDefault");
CREATE INDEX "MaturityPerspective_capabilityId_createdAt_idx"
    ON "MaturityPerspective"("capabilityId", "createdAt");
CREATE INDEX "MaturityPerspective_capabilityId_stakeholderType_idx"
    ON "MaturityPerspective"("capabilityId", "stakeholderType");

ALTER TABLE "MaturityRubric"
    ADD CONSTRAINT "MaturityRubric_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaturityPerspective"
    ADD CONSTRAINT "MaturityPerspective_capabilityId_fkey"
    FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaturityPerspective"
    ADD CONSTRAINT "MaturityPerspective_stakeholderId_fkey"
    FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
