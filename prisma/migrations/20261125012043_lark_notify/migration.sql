-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "larkAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "larkError" TEXT,
ADD COLUMN     "larkNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "larkStatus" TEXT;

-- CreateIndex
CREATE INDEX "notifications_larkStatus_larkNextAttemptAt_idx" ON "notifications"("larkStatus", "larkNextAttemptAt");
