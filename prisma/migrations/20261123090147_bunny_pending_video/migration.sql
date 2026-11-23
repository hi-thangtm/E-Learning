-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "pendingVideoCreatedAt" TIMESTAMP(3),
ADD COLUMN     "pendingVideoId" TEXT;

-- CreateIndex
CREATE INDEX "lessons_videoId_idx" ON "lessons"("videoId");
