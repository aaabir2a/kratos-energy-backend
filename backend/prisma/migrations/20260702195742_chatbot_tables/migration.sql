-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "chatbot_lead_id" TEXT;

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "chatbot_id" TEXT,
    "chatbot_name" TEXT,
    "session_id" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'ai',
    "waiting_for_human" BOOLEAN NOT NULL DEFAULT false,
    "assigned_agent_name" TEXT,
    "lead_captured" BOOLEAN NOT NULL DEFAULT false,
    "lead_id" UUID,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_sender" TEXT,
    "last_message" TEXT,
    "last_message_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "external_id" INTEGER,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent_name" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_external_id_key" ON "chat_conversations"("external_id");

-- CreateIndex
CREATE INDEX "chat_conversations_waiting_for_human_idx" ON "chat_conversations"("waiting_for_human");

-- CreateIndex
CREATE INDEX "chat_conversations_last_message_at_idx" ON "chat_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "chat_conversations_lead_id_idx" ON "chat_conversations"("lead_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_sent_at_idx" ON "chat_messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_conversation_id_external_id_key" ON "chat_messages"("conversation_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_chatbot_lead_id_key" ON "leads"("chatbot_lead_id");

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

