-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('REFERRAL', 'FOLLOW_UP', 'AFTERCARE', 'QUOTE', 'TRANSACTIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SequenceTrigger" AS ENUM ('LEAD_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'CAMPAIGN', 'MANUAL');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('ACTIVE', 'HELD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MessageEventType" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'MANUAL');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('PENDING', 'QUALIFIED', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL DEFAULT 'OTHER',
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_sequences" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "SequenceTrigger" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB,
    "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "stop_on_stage_change" BOOLEAN NOT NULL DEFAULT true,
    "stop_on_convert" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_steps" (
    "id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_enrolments" (
    "id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "deal_id" UUID,
    "campaign_id" UUID,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "hold_reason" TEXT,
    "held_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sequence_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "send_batches" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "template_id" UUID,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "skip_reasons" JSONB,
    "scheduled_for" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "send_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "lead_id" UUID,
    "deal_id" UUID,
    "enrolment_id" UUID,
    "step_id" UUID,
    "batch_id" UUID,
    "template_id" UUID,
    "template_version_id" UUID,
    "to_email" TEXT,
    "to_phone" TEXT,
    "subject" TEXT,
    "body_html" TEXT,
    "body_text" TEXT,
    "merge_data" JSONB,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_events" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "type" "MessageEventType" NOT NULL,
    "detail" TEXT,
    "provider_event_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_suppressions" (
    "id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "lead_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_campaigns" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "sequence_id" UUID,
    "segment" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_holds" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "raised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "note" TEXT,

    CONSTRAINT "campaign_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrer_lead_id" UUID NOT NULL,
    "referred_lead_id" UUID,
    "campaign_id" UUID,
    "deal_id" UUID,
    "referred_name" TEXT,
    "referred_email" TEXT,
    "referred_phone" TEXT,
    "voucher_status" "VoucherStatus" NOT NULL DEFAULT 'PENDING',
    "voucher_amount" DECIMAL(10,2) NOT NULL DEFAULT 250,
    "qualified_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_key" ON "message_templates"("key");

-- CreateIndex
CREATE INDEX "message_templates_category_is_active_idx" ON "message_templates"("category", "is_active");

-- CreateIndex
CREATE INDEX "message_templates_channel_idx" ON "message_templates"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_template_id_version_key" ON "template_versions"("template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "message_sequences_key_key" ON "message_sequences"("key");

-- CreateIndex
CREATE INDEX "message_sequences_trigger_is_active_idx" ON "message_sequences"("trigger", "is_active");

-- CreateIndex
CREATE INDEX "sequence_steps_template_id_idx" ON "sequence_steps"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_steps_sequence_id_position_key" ON "sequence_steps"("sequence_id", "position");

-- CreateIndex
CREATE INDEX "sequence_enrolments_sequence_id_status_idx" ON "sequence_enrolments"("sequence_id", "status");

-- CreateIndex
CREATE INDEX "sequence_enrolments_lead_id_idx" ON "sequence_enrolments"("lead_id");

-- CreateIndex
CREATE INDEX "sequence_enrolments_campaign_id_idx" ON "sequence_enrolments"("campaign_id");

-- CreateIndex
CREATE INDEX "send_batches_created_at_idx" ON "send_batches"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_messages_idempotency_key_key" ON "scheduled_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_messages_status_scheduled_for_idx" ON "scheduled_messages"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_messages_lead_id_idx" ON "scheduled_messages"("lead_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_batch_id_idx" ON "scheduled_messages"("batch_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_enrolment_id_idx" ON "scheduled_messages"("enrolment_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_events_provider_event_id_key" ON "message_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "message_events_message_id_occurred_at_idx" ON "message_events"("message_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_suppressions_channel_address_key" ON "message_suppressions"("channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "message_campaigns_key_key" ON "message_campaigns"("key");

-- CreateIndex
CREATE INDEX "campaign_holds_campaign_id_resolved_at_idx" ON "campaign_holds"("campaign_id", "resolved_at");

-- CreateIndex
CREATE INDEX "campaign_holds_lead_id_idx" ON "campaign_holds"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_lead_id_key" ON "referrals"("referred_lead_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_lead_id_idx" ON "referrals"("referrer_lead_id");

-- CreateIndex
CREATE INDEX "referrals_voucher_status_idx" ON "referrals"("voucher_status");

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "message_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrolments" ADD CONSTRAINT "sequence_enrolments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "message_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrolments" ADD CONSTRAINT "sequence_enrolments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrolments" ADD CONSTRAINT "sequence_enrolments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrolments" ADD CONSTRAINT "sequence_enrolments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "message_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "send_batches" ADD CONSTRAINT "send_batches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "sequence_enrolments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "sequence_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "send_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "scheduled_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "message_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_holds" ADD CONSTRAINT "campaign_holds_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "message_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_holds" ADD CONSTRAINT "campaign_holds_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_lead_id_fkey" FOREIGN KEY ("referrer_lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_lead_id_fkey" FOREIGN KEY ("referred_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "message_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

