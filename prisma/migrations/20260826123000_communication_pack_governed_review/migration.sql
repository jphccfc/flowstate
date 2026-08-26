CREATE TYPE "CommunicationPackStatus" AS ENUM ('DRAFT','READY_FOR_REVIEW','CHANGES_REQUESTED','APPROVED_FOR_DISTRIBUTION','ACKNOWLEDGED');
ALTER TABLE "CommunicationPack" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CommunicationPack" ALTER COLUMN "status" TYPE "CommunicationPackStatus" USING "status"::"CommunicationPackStatus";
ALTER TABLE "CommunicationPack" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TYPE "CommunicationPackAction" ADD VALUE 'SUBMITTED';
ALTER TYPE "CommunicationPackAction" ADD VALUE 'APPROVED';
