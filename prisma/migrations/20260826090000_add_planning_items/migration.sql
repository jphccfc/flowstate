CREATE TYPE "PlanningItemType" AS ENUM ('REQUIREMENT', 'SPECIFICATION', 'GOAL', 'OBJECTIVE');
CREATE TYPE "PlanningItemLifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PlanningItemApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PlanningItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "PlanningItemType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ownerEmail" TEXT,
  "targetDate" TIMESTAMP(3),
  "lifecycleStatus" "PlanningItemLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  "humanApprovalState" "PlanningItemApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "parentId" TEXT,
  "approvedInsightId" TEXT,
  CONSTRAINT "PlanningItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlanningItem_organizationId_type_lifecycleStatus_idx" ON "PlanningItem"("organizationId", "type", "lifecycleStatus");
CREATE INDEX "PlanningItem_organizationId_targetDate_idx" ON "PlanningItem"("organizationId", "targetDate");
CREATE INDEX "PlanningItem_parentId_idx" ON "PlanningItem"("parentId");
CREATE INDEX "PlanningItem_approvedInsightId_idx" ON "PlanningItem"("approvedInsightId");
ALTER TABLE "PlanningItem" ADD CONSTRAINT "PlanningItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningItem" ADD CONSTRAINT "PlanningItem_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("email") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningItem" ADD CONSTRAINT "PlanningItem_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("email") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningItem" ADD CONSTRAINT "PlanningItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PlanningItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningItem" ADD CONSTRAINT "PlanningItem_approvedInsightId_fkey" FOREIGN KEY ("approvedInsightId") REFERENCES "ApprovedInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
