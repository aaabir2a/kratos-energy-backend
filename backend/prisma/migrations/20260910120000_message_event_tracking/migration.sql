-- AlterTable
ALTER TABLE "message_events" ADD COLUMN     "machine" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "url" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- CreateIndex
CREATE INDEX "message_events_type_machine_occurred_at_idx" ON "message_events"("type", "machine", "occurred_at");
