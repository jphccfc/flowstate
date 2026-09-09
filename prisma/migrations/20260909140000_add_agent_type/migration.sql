-- Add an explicit role to catalogue agents. Existing definitions remain specialists.
CREATE TYPE "AgentType" AS ENUM ('SPECIALIST', 'ORCHESTRATOR');

ALTER TABLE "AgentDefinition"
  ADD COLUMN "agentType" "AgentType" NOT NULL DEFAULT 'SPECIALIST';
