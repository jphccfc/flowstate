-- Additive version-aware evidence model. Existing documents remain independent
-- until the importer can establish a conservative family match.
CREATE TYPE "DocumentVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

CREATE TABLE "DocumentFamily" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "sourcePath" TEXT,
    "currentCapturedInputId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentFamily_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CapturedInput"
    ADD COLUMN "documentFamilyId" TEXT,
    ADD COLUMN "versionLabel" TEXT,
    ADD COLUMN "versionMajor" INTEGER,
    ADD COLUMN "versionMinor" INTEGER,
    ADD COLUMN "versionExplicit" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "versionStatus" "DocumentVersionStatus" NOT NULL DEFAULT 'CURRENT',
    ADD COLUMN "sourcePath" TEXT;

ALTER TABLE "DocumentFinding"
    ADD COLUMN "documentFamilyId" TEXT;

CREATE INDEX "DocumentFamily_organizationId_normalizedTitle_idx" ON "DocumentFamily"("organizationId", "normalizedTitle");
CREATE INDEX "DocumentFamily_organizationId_sourcePath_idx" ON "DocumentFamily"("organizationId", "sourcePath");
CREATE INDEX "CapturedInput_documentFamilyId_idx" ON "CapturedInput"("documentFamilyId");
CREATE INDEX "CapturedInput_organizationId_versionStatus_idx" ON "CapturedInput"("organizationId", "versionStatus");
CREATE INDEX "DocumentFinding_documentFamilyId_idx" ON "DocumentFinding"("documentFamilyId");

ALTER TABLE "DocumentFamily" ADD CONSTRAINT "DocumentFamily_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapturedInput" ADD CONSTRAINT "CapturedInput_documentFamilyId_fkey"
    FOREIGN KEY ("documentFamilyId") REFERENCES "DocumentFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentFinding" ADD CONSTRAINT "DocumentFinding_documentFamilyId_fkey"
    FOREIGN KEY ("documentFamilyId") REFERENCES "DocumentFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;
