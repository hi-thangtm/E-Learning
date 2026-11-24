-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "larkDepartmentId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inactiveSource" TEXT,
ADD COLUMN     "passwordSet" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "companies_larkDepartmentId_key" ON "companies"("larkDepartmentId");

