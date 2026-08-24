-- Project Yoda: growth actions linked to approved insights.
CREATE TABLE "GrowthAction" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" INTEGER DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrowthAction_insightId_status_idx" ON "GrowthAction"("insightId", "status");
CREATE INDEX "GrowthAction_ownerEmail_status_idx" ON "GrowthAction"("ownerEmail", "status");
ALTER TABLE "GrowthAction" ADD CONSTRAINT "GrowthAction_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "ApprovedInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
