-- Add includeInFeed flag to saved_searches
ALTER TABLE "saved_searches"
ADD COLUMN "includeInFeed" BOOLEAN NOT NULL DEFAULT true;
