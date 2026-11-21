-- AlterTable
ALTER TABLE "course_sections" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;
