-- Capture expected value and assumptions for strategic Growth Plan initiatives.
ALTER TABLE "GrowthAction" ADD COLUMN "expectedValue" DOUBLE PRECISION;
ALTER TABLE "GrowthAction" ADD COLUMN "valueAssumptions" TEXT;
