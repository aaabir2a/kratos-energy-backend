-- Catch-up migration: brings the migration history in line with schema.prisma.
-- Two changes had been applied to the live database directly (prisma db push)
-- without a migration, so a database built from migrations alone was wrong:
--   1) the blogs CMS tables (commit 822fb28)
--   2) the landing-page / lead-form split (commit 7d43624)
-- The live database already matches this state; it is marked as applied there
-- via `prisma migrate resolve --applied`.

-- CreateEnum
CREATE TYPE "BlogStatus" AS ENUM ('draft', 'published');

-- DropForeignKey
ALTER TABLE "custom_lead_forms" DROP CONSTRAINT "custom_lead_forms_landing_page_id_fkey";

-- DropIndex
DROP INDEX "custom_lead_forms_landing_page_id_idx";

-- Preserve the existing page <-> form links before the owning column is
-- dropped: the relation moves from custom_lead_forms.landing_page_id to
-- landing_pages.custom_lead_form_id. (No-op on a fresh database.)
ALTER TABLE "landing_pages" ADD COLUMN     "custom_lead_form_id" UUID;

UPDATE "landing_pages" p
SET "custom_lead_form_id" = f."id"
FROM "custom_lead_forms" f
WHERE f."landing_page_id" = p."id"
  AND p."custom_lead_form_id" IS NULL;

-- AlterTable
ALTER TABLE "custom_lead_forms" DROP COLUMN "landing_page_id";


-- CreateTable
CREATE TABLE "blog_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blog_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "author" TEXT,
    "featured_image" TEXT,
    "read_mins" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "status" "BlogStatus" NOT NULL DEFAULT 'draft',
    "category_id" INTEGER,
    "type_id" INTEGER,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "canonical_url" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_types_slug_key" ON "blog_types"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_published_at_idx" ON "blog_posts"("status", "published_at");

-- CreateIndex
CREATE INDEX "blog_posts_slug_idx" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_category_id_idx" ON "blog_posts"("category_id");

-- CreateIndex
CREATE INDEX "blog_posts_type_id_idx" ON "blog_posts"("type_id");

-- CreateIndex
CREATE INDEX "landing_pages_custom_lead_form_id_idx" ON "landing_pages"("custom_lead_form_id");

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_custom_lead_form_id_fkey" FOREIGN KEY ("custom_lead_form_id") REFERENCES "custom_lead_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "blog_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

