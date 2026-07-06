-- AlterTable
ALTER TABLE "custom_lead_forms" ADD COLUMN     "is_global" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "landing_page_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "custom_lead_forms_is_global_idx" ON "custom_lead_forms"("is_global");
