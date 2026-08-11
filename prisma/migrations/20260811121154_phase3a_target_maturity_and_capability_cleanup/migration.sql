-- AlterTable
ALTER TABLE "Capability" DROP COLUMN "asIsNotes",
DROP COLUMN "asIsScore",
DROP COLUMN "asIsState",
DROP COLUMN "gapScore",
DROP COLUMN "opportunities",
DROP COLUMN "toBeScore",
DROP COLUMN "toBeState",
DROP COLUMN "weaknesses",
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "engagementMotive" TEXT;

-- CreateTable
CREATE TABLE "TargetMaturity" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "locationTag" TEXT,
    "score" INTEGER NOT NULL,
    "rationale" TEXT,
    "committedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceSegmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "setBy" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetMaturity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TargetMaturity_capabilityId_locationTag_setAt_idx" ON "TargetMaturity"("capabilityId", "locationTag", "setAt");

-- AddForeignKey
ALTER TABLE "TargetMaturity" ADD CONSTRAINT "TargetMaturity_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

