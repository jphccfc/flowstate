ALTER TABLE "MeetingContext" ADD COLUMN "dateTime" TIMESTAMP(3);
ALTER TABLE "MeetingContext" ADD COLUMN "stakeholders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MeetingContext" ADD COLUMN "domain" TEXT;
