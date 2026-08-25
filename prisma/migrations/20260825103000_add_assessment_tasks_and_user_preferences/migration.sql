ALTER TABLE "User" ADD COLUMN "preferences" JSONB;

CREATE TYPE "AssessmentTaskType" AS ENUM ('EVIDENCE_REQUEST','INTERVIEW','FOLLOW_UP','VALIDATION','REVIEW','SIGN_OFF','REPORT_PREPARATION');
CREATE TYPE "AssessmentTaskStatus" AS ENUM ('OPEN','AWAITING_INPUT','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED');
CREATE TYPE "AssessmentTaskReviewState" AS ENUM ('NOT_REQUIRED','PENDING_HUMAN_REVIEW','APPROVED','REJECTED');

CREATE TABLE "AssessmentTask" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "requesterId" TEXT NOT NULL, "assigneeId" TEXT NOT NULL,
  "type" "AssessmentTaskType" NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL, "context" TEXT,
  "dueDate" TIMESTAMP(3) NOT NULL, "priority" INTEGER NOT NULL DEFAULT 3, "status" "AssessmentTaskStatus" NOT NULL DEFAULT 'OPEN',
  "humanReviewState" "AssessmentTaskReviewState" NOT NULL DEFAULT 'NOT_REQUIRED', "linkedEvidenceId" TEXT, "linkedCapabilityId" TEXT,
  "linkedDecisionId" TEXT, "linkedReportSection" TEXT, "completedAt" TIMESTAMP(3), "completedById" TEXT, "completionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssessmentTask_organizationId_status_dueDate_idx" ON "AssessmentTask"("organizationId", "status", "dueDate");
CREATE INDEX "AssessmentTask_assigneeId_status_idx" ON "AssessmentTask"("assigneeId", "status");
ALTER TABLE "AssessmentTask" ADD CONSTRAINT "AssessmentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentTask" ADD CONSTRAINT "AssessmentTask_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentTask" ADD CONSTRAINT "AssessmentTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentTask" ADD CONSTRAINT "AssessmentTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
