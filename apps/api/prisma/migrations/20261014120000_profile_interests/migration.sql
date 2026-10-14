-- CreateTable
CREATE TABLE "Interest" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProfileInterest" (
    "profileId" TEXT NOT NULL,
    "interestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileInterest_pkey" PRIMARY KEY ("profileId","interestKey")
);

-- CreateIndex
CREATE INDEX "Interest_isActive_sortOrder_idx" ON "Interest"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ProfileInterest_interestKey_idx" ON "ProfileInterest"("interestKey");

-- AddForeignKey
ALTER TABLE "ProfileInterest" ADD CONSTRAINT "ProfileInterest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileInterest" ADD CONSTRAINT "ProfileInterest_interestKey_fkey" FOREIGN KEY ("interestKey") REFERENCES "Interest"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
