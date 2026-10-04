-- AlterTable
ALTER TABLE "PartnerPreference" ADD COLUMN     "discoveryConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibilityConfigured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserDiscoveryCategory" (
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDiscoveryCategory_pkey" PRIMARY KEY ("userId","category")
);

-- CreateTable
CREATE TABLE "UserVisibilityCategory" (
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserVisibilityCategory_pkey" PRIMARY KEY ("userId","category")
);

-- CreateIndex
CREATE INDEX "UserDiscoveryCategory_category_idx" ON "UserDiscoveryCategory"("category");

-- CreateIndex
CREATE INDEX "UserVisibilityCategory_category_idx" ON "UserVisibilityCategory"("category");

-- AddForeignKey
ALTER TABLE "UserDiscoveryCategory" ADD CONSTRAINT "UserDiscoveryCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveryCategory" ADD CONSTRAINT "UserDiscoveryCategory_category_fkey" FOREIGN KEY ("category") REFERENCES "NetWorthCategoryRef"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVisibilityCategory" ADD CONSTRAINT "UserVisibilityCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVisibilityCategory" ADD CONSTRAINT "UserVisibilityCategory_category_fkey" FOREIGN KEY ("category") REFERENCES "NetWorthCategoryRef"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
