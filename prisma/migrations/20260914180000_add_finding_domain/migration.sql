ALTER TABLE "DocumentFinding" ADD COLUMN "domainId" TEXT;
ALTER TABLE "DocumentFinding" ADD COLUMN "domainName" TEXT;
CREATE INDEX "DocumentFinding_domainId_idx" ON "DocumentFinding"("domainId");
