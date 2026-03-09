-- Allow wishlist items to exist without a price alert target.
-- A NULL target_price means alerts are not set until user manually configures one.
ALTER TABLE "wishlist_items"
ALTER COLUMN "target_price" DROP NOT NULL;
