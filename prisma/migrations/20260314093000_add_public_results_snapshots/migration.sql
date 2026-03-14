-- CreateTable
CREATE TABLE "public_results_snapshots" (
  "id" TEXT NOT NULL,
  "searchName" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "public_results_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_results_snapshots_expiresAt_idx" ON "public_results_snapshots"("expiresAt");
