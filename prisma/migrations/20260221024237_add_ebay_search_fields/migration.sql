-- AlterTable
ALTER TABLE "saved_searches" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "searchQuery" TEXT,
ADD COLUMN     "sortBy" TEXT,
ADD COLUMN     "sortOrder" TEXT;
