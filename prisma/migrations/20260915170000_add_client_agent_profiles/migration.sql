CREATE TABLE "OrganizationAgentProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentDefinitionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationAgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationAgentProfile_organizationId_agentDefinitionId_key" ON "OrganizationAgentProfile"("organizationId", "agentDefinitionId");
CREATE UNIQUE INDEX "OrganizationAgentProfile_organizationId_alias_key" ON "OrganizationAgentProfile"("organizationId", "alias");
CREATE UNIQUE INDEX "OrganizationAgentProfile_organizationId_normalizedAlias_key" ON "OrganizationAgentProfile"("organizationId", "normalizedAlias");
CREATE INDEX "OrganizationAgentProfile_organizationId_idx" ON "OrganizationAgentProfile"("organizationId");

ALTER TABLE "OrganizationAgentProfile" ADD CONSTRAINT "OrganizationAgentProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAgentProfile" ADD CONSTRAINT "OrganizationAgentProfile_agentDefinitionId_fkey"
  FOREIGN KEY ("agentDefinitionId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
