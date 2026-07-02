-- CreateEnum
CREATE TYPE "TouchType" AS ENUM ('FIRST', 'LAST');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'REJECTED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campaign_id" UUID;

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "channel" TEXT,
    "utm_campaign" TEXT,
    "budget" DECIMAL(12,2),
    "spend" DECIMAL(12,2),
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attributions" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "lead_source_id" UUID,
    "campaign_id" UUID,
    "landing_page_id" UUID,
    "touch_type" "TouchType" NOT NULL DEFAULT 'FIRST',
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "referrer_url" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_sessions" (
    "id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "lead_id" UUID,
    "bot_version" TEXT,
    "transcript" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" UUID NOT NULL,
    "lead_id" UUID,
    "channel" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'ACCEPTED',
    "raw_payload" JSONB NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_campaigns_slug_key" ON "marketing_campaigns"("slug");

-- CreateIndex
CREATE INDEX "marketing_campaigns_utm_campaign_idx" ON "marketing_campaigns"("utm_campaign");

-- CreateIndex
CREATE INDEX "lead_attributions_lead_id_idx" ON "lead_attributions"("lead_id");

-- CreateIndex
CREATE INDEX "lead_attributions_lead_source_id_created_at_idx" ON "lead_attributions"("lead_source_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_attributions_campaign_id_idx" ON "lead_attributions"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_sessions_session_id_key" ON "chatbot_sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_sessions_lead_id_key" ON "chatbot_sessions"("lead_id");

-- CreateIndex
CREATE INDEX "form_submissions_channel_created_at_idx" ON "form_submissions"("channel", "created_at");

-- CreateIndex
CREATE INDEX "form_submissions_lead_id_idx" ON "form_submissions"("lead_id");

-- CreateIndex
CREATE INDEX "leads_campaign_id_idx" ON "leads"("campaign_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_lead_source_id_fkey" FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_sessions" ADD CONSTRAINT "chatbot_sessions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
