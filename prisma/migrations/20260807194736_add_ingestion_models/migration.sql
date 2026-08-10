-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('AUDIO', 'TEXT_NOTE', 'EMAIL', 'DOCUMENT', 'DATA_ROOM_FILE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'TRANSCRIBING', 'TRANSCRIBED', 'SEGMENTING', 'TAGGING', 'TAGGED', 'FAILED');

-- DropForeignKey
ALTER TABLE "Achievement" DROP CONSTRAINT "Achievement_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "AchievementStakeholder" DROP CONSTRAINT "AchievementStakeholder_achievementId_fkey";

-- DropForeignKey
ALTER TABLE "AchievementStakeholder" DROP CONSTRAINT "AchievementStakeholder_stakeholderId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentSession" DROP CONSTRAINT "AssessmentSession_advisorId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentSession" DROP CONSTRAINT "AssessmentSession_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessDomain" DROP CONSTRAINT "BusinessDomain_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Capability" DROP CONSTRAINT "Capability_domainId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityKPI" DROP CONSTRAINT "CapabilityKPI_capabilityId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityKPI" DROP CONSTRAINT "CapabilityKPI_kpiId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityProcess" DROP CONSTRAINT "CapabilityProcess_capabilityId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityProcess" DROP CONSTRAINT "CapabilityProcess_processId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityStakeholder" DROP CONSTRAINT "CapabilityStakeholder_capabilityId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityStakeholder" DROP CONSTRAINT "CapabilityStakeholder_stakeholderId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityTechnology" DROP CONSTRAINT "CapabilityTechnology_capabilityId_fkey";

-- DropForeignKey
ALTER TABLE "CapabilityTechnology" DROP CONSTRAINT "CapabilityTechnology_technologyId_fkey";

-- DropForeignKey
ALTER TABLE "KPI" DROP CONSTRAINT "KPI_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Process" DROP CONSTRAINT "Process_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCapability" DROP CONSTRAINT "ProjectCapability_capabilityId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCapability" DROP CONSTRAINT "ProjectCapability_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Stakeholder" DROP CONSTRAINT "Stakeholder_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Technology" DROP CONSTRAINT "Technology_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrganization" DROP CONSTRAINT "UserOrganization_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrganization" DROP CONSTRAINT "UserOrganization_userId_fkey";

-- AlterTable
ALTER TABLE "Achievement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AssessmentSession" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BusinessDomain" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Capability" ALTER COLUMN "aliases" DROP DEFAULT,
ALTER COLUMN "dimensions" DROP DEFAULT,
ALTER COLUMN "metrics" DROP DEFAULT,
ALTER COLUMN "opportunities" DROP DEFAULT,
ALTER COLUMN "weaknesses" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KPI" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Process" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Stakeholder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Technology" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CapturedInput" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "InputType" NOT NULL,
    "sourceRef" TEXT,
    "rawText" TEXT,
    "locationTag" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapturedInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapturedSegment" (
    "id" TEXT NOT NULL,
    "capturedInputId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "speaker" TEXT,
    "text" TEXT NOT NULL,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapturedSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDomain" ADD CONSTRAINT "BusinessDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "BusinessDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityStakeholder" ADD CONSTRAINT "CapabilityStakeholder_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityStakeholder" ADD CONSTRAINT "CapabilityStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPI" ADD CONSTRAINT "KPI_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityKPI" ADD CONSTRAINT "CapabilityKPI_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityKPI" ADD CONSTRAINT "CapabilityKPI_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityProcess" ADD CONSTRAINT "CapabilityProcess_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityProcess" ADD CONSTRAINT "CapabilityProcess_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technology" ADD CONSTRAINT "Technology_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityTechnology" ADD CONSTRAINT "CapabilityTechnology_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityTechnology" ADD CONSTRAINT "CapabilityTechnology_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCapability" ADD CONSTRAINT "ProjectCapability_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCapability" ADD CONSTRAINT "ProjectCapability_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementStakeholder" ADD CONSTRAINT "AchievementStakeholder_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementStakeholder" ADD CONSTRAINT "AchievementStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturedInput" ADD CONSTRAINT "CapturedInput_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturedInput" ADD CONSTRAINT "CapturedInput_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapturedSegment" ADD CONSTRAINT "CapturedSegment_capturedInputId_fkey" FOREIGN KEY ("capturedInputId") REFERENCES "CapturedInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
