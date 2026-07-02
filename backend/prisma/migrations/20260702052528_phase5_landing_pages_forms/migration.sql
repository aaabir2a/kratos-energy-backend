-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "campaign_id" UUID,
    "package_id" UUID,
    "title" TEXT NOT NULL,
    "url_slug" TEXT NOT NULL,
    "hero_description" TEXT,
    "hero_image_url" TEXT,
    "detailed_description" TEXT,
    "thank_you_message" TEXT,
    "redirect_url" TEXT,
    "seo_meta" JSONB,
    "theme_config" JSONB,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "conversion_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_lead_forms" (
    "id" UUID NOT NULL,
    "landing_page_id" UUID NOT NULL,
    "form_title" TEXT NOT NULL,
    "fields_schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "submit_button_text" TEXT NOT NULL DEFAULT 'Get my free quote',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_url_slug_key" ON "landing_pages"("url_slug");

-- CreateIndex
CREATE INDEX "landing_pages_status_idx" ON "landing_pages"("status");

-- CreateIndex
CREATE INDEX "landing_pages_campaign_id_idx" ON "landing_pages"("campaign_id");

-- CreateIndex
CREATE INDEX "custom_lead_forms_landing_page_id_idx" ON "custom_lead_forms"("landing_page_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_landing_page_id_fkey" FOREIGN KEY ("landing_page_id") REFERENCES "landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_lead_forms" ADD CONSTRAINT "custom_lead_forms_landing_page_id_fkey" FOREIGN KEY ("landing_page_id") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
