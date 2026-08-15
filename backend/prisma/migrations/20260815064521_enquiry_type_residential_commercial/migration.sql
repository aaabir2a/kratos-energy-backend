-- CreateEnum
CREATE TYPE "EnquiryType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "custom_lead_forms" ADD COLUMN     "enquiry_type" "EnquiryType";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "enquiry_type" "EnquiryType" NOT NULL DEFAULT 'RESIDENTIAL';

-- CreateIndex
CREATE INDEX "leads_enquiry_type_idx" ON "leads"("enquiry_type");
