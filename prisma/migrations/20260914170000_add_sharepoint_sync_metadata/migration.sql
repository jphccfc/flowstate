-- Add source provenance fields to CapturedInput
ALTER TABLE "CapturedInput" ADD COLUMN "sourceDriveId" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN "sourceItemId" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN "sourceVersion" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN "sourceHash" TEXT;

-- Add explicit source removal state
ALTER TYPE "FindingStatus" ADD VALUE 'SOURCE_REMOVED';

-- CreateTable
CREATE TABLE "IntegrationSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'microsoft-365',
    "siteId" TEXT NOT NULL,
    "siteName" TEXT,
    "driveId" TEXT NOT NULL,
    "driveName" TEXT,
    "folderItemId" TEXT NOT NULL DEFAULT 'root',
    "folderPath" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deltaLink" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSource_organizationId_provider_driveId_folderItemId_key"
  ON "IntegrationSource"("organizationId", "provider", "driveId", "folderItemId");
CREATE INDEX "IntegrationSource_organizationId_enabled_idx"
  ON "IntegrationSource"("organizationId", "enabled");

ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
