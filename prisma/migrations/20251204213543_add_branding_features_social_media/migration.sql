/*
  Warnings:

  - You are about to drop the column `accentColor` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `backgroundColor` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `categoryDisplay` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryEnabled` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `loyaltyEnabled` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `menuStyle` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `primaryColor` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `reservationsEnabled` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `secondaryColor` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `showHeroSection` on the `Restaurant` table. All the data in the column will be lost.
  - Made the column `restaurantId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "accentColor",
DROP COLUMN "backgroundColor",
DROP COLUMN "categoryDisplay",
DROP COLUMN "deliveryEnabled",
DROP COLUMN "loyaltyEnabled",
DROP COLUMN "menuStyle",
DROP COLUMN "primaryColor",
DROP COLUMN "reservationsEnabled",
DROP COLUMN "secondaryColor",
DROP COLUMN "showHeroSection",
ADD COLUMN     "branding" JSONB,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "socialMedia" JSONB;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "restaurantId" SET NOT NULL;
