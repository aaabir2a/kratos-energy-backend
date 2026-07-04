-- CreateEnum
CREATE TYPE "HeroVariant" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateTable
CREATE TABLE "hero_images" (
    "id" UUID NOT NULL,
    "variant" "HeroVariant" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "original_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hero_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hero_images_variant_is_active_sort_order_idx" ON "hero_images"("variant", "is_active", "sort_order");

