-- Add global price drop percentage setting to User model
ALTER TABLE "users" ADD COLUMN "globalPriceDropPercentage" DECIMAL(5,2);

-- Add tracking field to distinguish manually set vs auto-set price alerts
ALTER TABLE "wishlist_items" ADD COLUMN "targetPriceSetManually" BOOLEAN NOT NULL DEFAULT false;
