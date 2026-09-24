CREATE TYPE "TagAttachmentSource" AS ENUM ('MANUAL', 'AI_SUGGESTED', 'IMPORTED');
CREATE TYPE "TagAttachmentStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

CREATE TABLE "TagDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TagDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TagAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tagDefinitionId" TEXT NOT NULL,
    "capturedInputId" TEXT NOT NULL,
    "segmentId" TEXT,
    "targetKey" TEXT NOT NULL,
    "source" "TagAttachmentSource" NOT NULL,
    "status" "TagAttachmentStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TagAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TagDefinition_organizationId_normalizedName_key" ON "TagDefinition"("organizationId", "normalizedName");
CREATE INDEX "TagDefinition_organizationId_active_idx" ON "TagDefinition"("organizationId", "active");
CREATE UNIQUE INDEX "TagAttachment_tagDefinitionId_targetKey_key" ON "TagAttachment"("tagDefinitionId", "targetKey");
CREATE INDEX "TagAttachment_organizationId_status_createdAt_idx" ON "TagAttachment"("organizationId", "status", "createdAt");
CREATE INDEX "TagAttachment_capturedInputId_idx" ON "TagAttachment"("capturedInputId");
CREATE INDEX "TagAttachment_segmentId_idx" ON "TagAttachment"("segmentId");

ALTER TABLE "TagDefinition" ADD CONSTRAINT "TagDefinition_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagAttachment" ADD CONSTRAINT "TagAttachment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagAttachment" ADD CONSTRAINT "TagAttachment_tagDefinitionId_fkey"
  FOREIGN KEY ("tagDefinitionId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagAttachment" ADD CONSTRAINT "TagAttachment_capturedInputId_fkey"
  FOREIGN KEY ("capturedInputId") REFERENCES "CapturedInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TagAttachment" ADD CONSTRAINT "TagAttachment_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "CapturedSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
