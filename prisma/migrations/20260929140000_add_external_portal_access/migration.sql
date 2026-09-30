CREATE TYPE "ExternalPortalRole" AS ENUM ('CLIENT', 'PARTNER');
CREATE TYPE "AssessmentTaskActivityType" AS ENUM ('STATUS_CHANGED', 'COMMENT_ADDED');

CREATE TABLE "StakeholderPortalMembership" (
  "id" TEXT NOT NULL,
  "stakeholderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ExternalPortalRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StakeholderPortalMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StakeholderPortalMembership_stakeholderId_userId_key" ON "StakeholderPortalMembership"("stakeholderId", "userId");
CREATE INDEX "StakeholderPortalMembership_userId_idx" ON "StakeholderPortalMembership"("userId");
ALTER TABLE "StakeholderPortalMembership" ADD CONSTRAINT "StakeholderPortalMembership_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakeholderPortalMembership" ADD CONSTRAINT "StakeholderPortalMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeetingContextStakeholder" (
  "meetingContextId" TEXT NOT NULL,
  "stakeholderId" TEXT NOT NULL,
  "attendedAt" TIMESTAMP(3),
  CONSTRAINT "MeetingContextStakeholder_pkey" PRIMARY KEY ("meetingContextId", "stakeholderId")
);
CREATE INDEX "MeetingContextStakeholder_stakeholderId_idx" ON "MeetingContextStakeholder"("stakeholderId");
ALTER TABLE "MeetingContextStakeholder" ADD CONSTRAINT "MeetingContextStakeholder_meetingContextId_fkey" FOREIGN KEY ("meetingContextId") REFERENCES "MeetingContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingContextStakeholder" ADD CONSTRAINT "MeetingContextStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentTaskStakeholder" (
  "assessmentTaskId" TEXT NOT NULL,
  "stakeholderId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentTaskStakeholder_pkey" PRIMARY KEY ("assessmentTaskId", "stakeholderId")
);
CREATE INDEX "AssessmentTaskStakeholder_stakeholderId_idx" ON "AssessmentTaskStakeholder"("stakeholderId");
ALTER TABLE "AssessmentTaskStakeholder" ADD CONSTRAINT "AssessmentTaskStakeholder_assessmentTaskId_fkey" FOREIGN KEY ("assessmentTaskId") REFERENCES "AssessmentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentTaskStakeholder" ADD CONSTRAINT "AssessmentTaskStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentTaskActivity" (
  "id" TEXT NOT NULL,
  "assessmentTaskId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorStakeholderId" TEXT,
  "type" "AssessmentTaskActivityType" NOT NULL,
  "previousStatus" "AssessmentTaskStatus",
  "nextStatus" "AssessmentTaskStatus",
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentTaskActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssessmentTaskActivity_assessmentTaskId_createdAt_idx" ON "AssessmentTaskActivity"("assessmentTaskId", "createdAt");
ALTER TABLE "AssessmentTaskActivity" ADD CONSTRAINT "AssessmentTaskActivity_assessmentTaskId_fkey" FOREIGN KEY ("assessmentTaskId") REFERENCES "AssessmentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentTaskActivity" ADD CONSTRAINT "AssessmentTaskActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentTaskActivity" ADD CONSTRAINT "AssessmentTaskActivity_actorStakeholderId_fkey" FOREIGN KEY ("actorStakeholderId") REFERENCES "Stakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
