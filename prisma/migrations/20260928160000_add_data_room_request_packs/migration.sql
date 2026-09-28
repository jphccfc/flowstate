CREATE TYPE "DataRoomRequestStatus" AS ENUM ('REQUESTED','RECEIVED','ACCEPTED','FOLLOW_UP_REQUIRED','NOT_APPLICABLE');

CREATE TABLE "DataRoomRequestPack" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assessmentTaskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRoomRequestPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomRequestCategory" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRoomRequestCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomRequestItem" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "status" "DataRoomRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "completionNote" TEXT,
  "linkedInputId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataRoomRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataRoomRequestPack_assessmentTaskId_key" ON "DataRoomRequestPack"("assessmentTaskId");
CREATE INDEX "DataRoomRequestPack_organizationId_createdAt_idx" ON "DataRoomRequestPack"("organizationId", "createdAt");
CREATE UNIQUE INDEX "DataRoomRequestCategory_packId_sortOrder_key" ON "DataRoomRequestCategory"("packId", "sortOrder");
CREATE INDEX "DataRoomRequestCategory_packId_sortOrder_idx" ON "DataRoomRequestCategory"("packId", "sortOrder");
CREATE UNIQUE INDEX "DataRoomRequestItem_categoryId_sortOrder_key" ON "DataRoomRequestItem"("categoryId", "sortOrder");
CREATE INDEX "DataRoomRequestItem_categoryId_status_sortOrder_idx" ON "DataRoomRequestItem"("categoryId", "status", "sortOrder");
CREATE INDEX "DataRoomRequestItem_linkedInputId_idx" ON "DataRoomRequestItem"("linkedInputId");

ALTER TABLE "DataRoomRequestPack" ADD CONSTRAINT "DataRoomRequestPack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomRequestPack" ADD CONSTRAINT "DataRoomRequestPack_assessmentTaskId_fkey" FOREIGN KEY ("assessmentTaskId") REFERENCES "AssessmentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomRequestCategory" ADD CONSTRAINT "DataRoomRequestCategory_packId_fkey" FOREIGN KEY ("packId") REFERENCES "DataRoomRequestPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomRequestItem" ADD CONSTRAINT "DataRoomRequestItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DataRoomRequestCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomRequestItem" ADD CONSTRAINT "DataRoomRequestItem_linkedInputId_fkey" FOREIGN KEY ("linkedInputId") REFERENCES "CapturedInput"("id") ON DELETE SET NULL ON UPDATE CASCADE;
