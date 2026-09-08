CREATE TABLE "MeetingContext" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "dateTime" TIMESTAMP(3),
  "stakeholderName" TEXT,
  "stakeholders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "domainName" TEXT,
  "domain" TEXT,
  "objectives" TEXT,
  "agendaItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "desiredOutcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetingContext_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CapturedInput" ADD COLUMN "meetingContextId" TEXT;
ALTER TABLE "CapturedInput" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "MeetingContext_organizationId_startsAt_idx" ON "MeetingContext"("organizationId", "startsAt");
CREATE INDEX "CapturedInput_meetingContextId_idx" ON "CapturedInput"("meetingContextId");
ALTER TABLE "MeetingContext" ADD CONSTRAINT "MeetingContext_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapturedInput" ADD CONSTRAINT "CapturedInput_meetingContextId_fkey" FOREIGN KEY ("meetingContextId") REFERENCES "MeetingContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;
