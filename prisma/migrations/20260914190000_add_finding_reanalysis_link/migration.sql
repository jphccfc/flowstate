ALTER TABLE "DocumentFinding" ADD COLUMN "reanalysisOfId" TEXT;
CREATE INDEX "DocumentFinding_reanalysisOfId_idx" ON "DocumentFinding"("reanalysisOfId");
