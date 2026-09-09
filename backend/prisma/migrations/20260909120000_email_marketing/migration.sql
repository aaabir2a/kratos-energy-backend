-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "scheduled_messages" ADD COLUMN     "contact_id" UUID;

-- CreateTable
CREATE TABLE "contact_lists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "custom_columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_contacts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "lead_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "marketing_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_list_members" (
    "list_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_list_members_pkey" PRIMARY KEY ("list_id","contact_id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "template_id" UUID,
    "batch_id" UUID,
    "scheduled_for" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "skip_reasons" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_lists" (
    "campaign_id" UUID NOT NULL,
    "list_id" UUID NOT NULL,

    CONSTRAINT "email_campaign_lists_pkey" PRIMARY KEY ("campaign_id","list_id")
);

-- CreateIndex
CREATE INDEX "contact_lists_deleted_at_idx" ON "contact_lists"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_contacts_email_key" ON "marketing_contacts"("email");

-- CreateIndex
CREATE INDEX "marketing_contacts_email_idx" ON "marketing_contacts"("email");

-- CreateIndex
CREATE INDEX "marketing_contacts_deleted_at_idx" ON "marketing_contacts"("deleted_at");

-- CreateIndex
CREATE INDEX "contact_list_members_contact_id_idx" ON "contact_list_members"("contact_id");

-- CreateIndex
CREATE INDEX "email_campaigns_status_scheduled_for_idx" ON "email_campaigns"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "email_campaigns_deleted_at_idx" ON "email_campaigns"("deleted_at");

-- CreateIndex
CREATE INDEX "email_campaign_lists_list_id_idx" ON "email_campaign_lists"("list_id");

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "contact_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "marketing_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "send_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_lists" ADD CONSTRAINT "email_campaign_lists_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_lists" ADD CONSTRAINT "email_campaign_lists_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "contact_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

