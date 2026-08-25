-- Add an explicit strategic outcome scenario to Growth Plan initiatives.
ALTER TABLE "GrowthAction" ADD COLUMN "outcomeScenario" TEXT NOT NULL DEFAULT 'PROFIT_GROWTH';
