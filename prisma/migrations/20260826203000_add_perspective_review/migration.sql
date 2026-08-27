-- Preserve reviewer attribution and notes for submitted perspectives.
ALTER TABLE "MaturityPerspective" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "MaturityPerspective" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "MaturityPerspective" ADD COLUMN "reviewedAt" TIMESTAMP(3);
