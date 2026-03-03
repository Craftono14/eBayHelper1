-- CreateTable FeedCache
CREATE TABLE "feed_cache" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feed_cache_userId_key" ON "feed_cache"("userId");

-- CreateIndex
CREATE INDEX "feed_cache_userId_idx" ON "feed_cache"("userId");

-- AddForeignKey
ALTER TABLE "feed_cache" ADD CONSTRAINT "feed_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
