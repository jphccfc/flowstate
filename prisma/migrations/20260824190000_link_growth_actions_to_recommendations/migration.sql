ALTER TABLE "Recommendation" ADD COLUMN "sourceGrowthActionId" TEXT;

CREATE UNIQUE INDEX "Recommendation_sourceGrowthActionId_key" ON "Recommendation"("sourceGrowthActionId");

ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_sourceGrowthActionId_fkey" FOREIGN KEY ("sourceGrowthActionId") REFERENCES "GrowthAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
