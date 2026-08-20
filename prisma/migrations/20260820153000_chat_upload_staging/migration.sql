-- CreateTable
CREATE TABLE "chat_upload_staging" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_upload_staging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_upload_staging_storagePath_key" ON "chat_upload_staging"("storagePath");

-- CreateIndex
CREATE INDEX "chat_upload_staging_memberId_idx" ON "chat_upload_staging"("memberId");

-- CreateIndex
CREATE INDEX "chat_upload_staging_createdAt_idx" ON "chat_upload_staging"("createdAt");

-- AddForeignKey
ALTER TABLE "chat_upload_staging" ADD CONSTRAINT "chat_upload_staging_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_upload_staging" ADD CONSTRAINT "chat_upload_staging_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;