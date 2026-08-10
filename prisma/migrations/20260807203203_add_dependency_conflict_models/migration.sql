-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('CAPABILITY_TO_KPI', 'KPI_TO_KPI', 'CAPABILITY_TO_CAPABILITY');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL,
    "sourceType" "TagTargetType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" "TagTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictFlag" (
    "id" TEXT NOT NULL,
    "entityType" "TagTargetType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "claims" JSONB NOT NULL,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dependency_sourceType_sourceId_idx" ON "Dependency"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Dependency_targetType_targetId_idx" ON "Dependency"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ConflictFlag_entityType_entityId_idx" ON "ConflictFlag"("entityType", "entityId");
