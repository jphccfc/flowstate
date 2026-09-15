-- The canonical Flow Coach agent was originally seeded as Client AI Hub.
-- Rename the display name only; preserve its key and prompt/version history.
UPDATE "AgentDefinition"
SET "name" = 'FlowCoach', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'client_ai_hub' AND "name" <> 'FlowCoach';
