-- Allow wishlist items to exist without a price alert target.
-- A NULL targetPrice means alerts are not set until user manually configures one.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'wishlist_items'
			AND column_name = 'targetPrice'
	) THEN
		ALTER TABLE "wishlist_items" ALTER COLUMN "targetPrice" DROP NOT NULL;
	ELSIF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'wishlist_items'
			AND column_name = 'target_price'
	) THEN
		ALTER TABLE "wishlist_items" ALTER COLUMN "target_price" DROP NOT NULL;
	ELSE
		RAISE EXCEPTION 'Neither targetPrice nor target_price column exists on wishlist_items';
	END IF;
END $$;
