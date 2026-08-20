-- AlterTable
ALTER TABLE "chat_upload_staging" ADD COLUMN "fileName" TEXT NOT NULL DEFAULT 'file';

-- AlterTable
ALTER TABLE "chat_upload_staging" ALTER COLUMN "fileName" DROP DEFAULT;

-- AlterTable
ALTER TABLE "chat_upload_staging" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "chat_upload_staging_familyId_idx" ON "chat_upload_staging"("familyId");

-- DropIndex
DROP INDEX "chat_upload_staging_createdAt_idx";