-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('ANNIVERSARY', 'FIRST_MOMENT');

-- CreateEnum
CREATE TYPE "TemplateExtraVar" AS ENUM ('NONE', 'BIRTHDATE', 'AGE', 'SCHOOL', 'FIRST_WORD', 'SIBLING_GENDER');

-- CreateEnum
CREATE TYPE "CoverType" AS ENUM ('SOFT', 'HARD');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('ENTRY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "CustomPath" AS ENUM ('PHONE', 'WRITTEN');

-- CreateEnum
CREATE TYPE "CustomStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('CHILD_PHOTO', 'QR_VIDEO', 'OTHER');

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "extraVar" "TemplateExtraVar" NOT NULL DEFAULT 'NONE',
    "softPriceWon" INTEGER NOT NULL DEFAULT 43000,
    "hardPriceWon" INTEGER NOT NULL DEFAULT 49000,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL DEFAULT 'ENTRY',
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "tossOrderId" TEXT NOT NULL,
    "tossPaymentKey" TEXT,
    "amountWon" INTEGER NOT NULL,
    "qrVideoAddon" BOOLEAN NOT NULL DEFAULT false,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "shipName" TEXT,
    "shipPhone" TEXT,
    "shipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "coverType" "CoverType" NOT NULL,
    "unitPriceWon" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Personalization" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "childGender" "Gender" NOT NULL,
    "extraVar" JSONB,
    "photoAssetId" TEXT,
    "dedication" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personalization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "path" "CustomPath" NOT NULL,
    "status" "CustomStatus" NOT NULL DEFAULT 'SUBMITTED',
    "form" JSONB NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "customRequestId" TEXT,
    "requestedSlot" TIMESTAMP(3) NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_key_key" ON "Template"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tossOrderId_key" ON "Order"("tossOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tossPaymentKey_key" ON "Order"("tossPaymentKey");

-- CreateIndex
CREATE UNIQUE INDEX "Personalization_orderItemId_key" ON "Personalization"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Personalization_photoAssetId_key" ON "Personalization"("photoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRequest_orderId_key" ON "CustomRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_customRequestId_key" ON "Consultation"("customRequestId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personalization" ADD CONSTRAINT "Personalization_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personalization" ADD CONSTRAINT "Personalization_photoAssetId_fkey" FOREIGN KEY ("photoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRequest" ADD CONSTRAINT "CustomRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_customRequestId_fkey" FOREIGN KEY ("customRequestId") REFERENCES "CustomRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
