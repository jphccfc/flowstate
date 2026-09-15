ALTER TABLE "DocumentFinding"
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "correctedDomainName" TEXT,
  ADD COLUMN "correctedCapabilityName" TEXT,
  ADD COLUMN "reviewAgentKey" TEXT,
  ADD COLUMN "reviewPromptVersion" INTEGER;
