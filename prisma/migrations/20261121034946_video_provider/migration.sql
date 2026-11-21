/*
  Warnings:

  - You are about to drop the column `bunnyVideoId` on the `lessons` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('YOUTUBE', 'BUNNY');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "lessons" DROP COLUMN "bunnyVideoId",
ADD COLUMN     "videoId" TEXT,
ADD COLUMN     "videoProvider" "VideoProvider",
ADD COLUMN     "videoStatus" "VideoStatus";
