CREATE TYPE "public"."tax_return_type" AS ENUM('economic_substance', 'company', 'personal', 'partnership', 'notification', 'other');--> statement-breakpoint
CREATE TABLE "lts_jersey_company_return_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_return_id" uuid NOT NULL,
	"section_1" jsonb,
	"schedule_a" jsonb,
	"distributions" jsonb,
	"compliance" jsonb,
	"economic_substance" jsonb,
	"additional_info" jsonb,
	"is_complete" boolean DEFAULT false,
	"missing_fields" jsonb,
	"ai_extracted_at" timestamp with time zone,
	"last_edited_at" timestamp with time zone,
	"last_edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_jersey_company_return_form_tax_return_id_unique" UNIQUE("tax_return_id")
);
--> statement-breakpoint
DROP INDEX "lts_tax_return_external_id_idx";--> statement-breakpoint
ALTER TABLE "lts_tax_return" ADD COLUMN "return_type" "tax_return_type" DEFAULT 'economic_substance' NOT NULL;--> statement-breakpoint
ALTER TABLE "lts_jersey_company_return_form" ADD CONSTRAINT "lts_jersey_company_return_form_tax_return_id_lts_tax_return_id_fk" FOREIGN KEY ("tax_return_id") REFERENCES "public"."lts_tax_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_jersey_company_return_form" ADD CONSTRAINT "lts_jersey_company_return_form_last_edited_by_lts_account_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lts_jersey_company_return_form_tax_return_idx" ON "lts_jersey_company_return_form" USING btree ("tax_return_id");--> statement-breakpoint
CREATE INDEX "lts_jersey_company_return_form_complete_idx" ON "lts_jersey_company_return_form" USING btree ("is_complete");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_tax_return_source_idx" ON "lts_tax_return" USING btree ("jurisdiction_id","external_id","tax_year","return_type");