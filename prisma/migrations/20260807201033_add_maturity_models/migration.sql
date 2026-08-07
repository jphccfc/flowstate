-- CreateTable
CREATE TABLE "MaturityAssessment" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "locationTag" TEXT,
    "score" INTEGER NOT NULL,
    "evidence" TEXT,
    "sourceSegmentIds" TEXT[],
    "assessedBy" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaturityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityKPIMaturityCeiling" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "maturityLevel" INTEGER NOT NULL,
    "targetCeilingMin" DOUBLE PRECISION,
    "targetCeilingMax" DOUBLE PRECISION,
    "valueToNextLevel" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "CapabilityKPIMaturityCeiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaturityAssessment_capabilityId_locationTag_assessedAt_idx" ON "MaturityAssessment"("capabilityId", "locationTag", "assessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityKPIMaturityCeiling_capabilityId_kpiId_maturityLev_key" ON "CapabilityKPIMaturityCeiling"("capabilityId", "kpiId", "maturityLevel");

-- AddForeignKey
ALTER TABLE "MaturityAssessment" ADD CONSTRAINT "MaturityAssessment_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityKPIMaturityCeiling" ADD CONSTRAINT "CapabilityKPIMaturityCeiling_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityKPIMaturityCeiling" ADD CONSTRAINT "CapabilityKPIMaturityCeiling_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KPI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
