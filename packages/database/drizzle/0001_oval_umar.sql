-- Add ESR gap closure fields to substance_form table
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "is_incorporated_guernsey" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "economic_classification_code" varchar(64);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "certificate_type" varchar(64);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "entity_activity" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "net_book_value" varchar(64);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "total_profit" varchar(64);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "has_ip_holding" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "is_high_risk_ip" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "wants_rebut_high_risk" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "high_risk_rebuttal_narrative" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "ip_income_type" varchar(128);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "has_adequate_expenditure" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "has_adequate_physical_presence" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "adequacy_expenditure_details" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "adequacy_physical_presence_details" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "is_constituent_entity" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "has_post_balance_event" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "post_balance_event_details" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "has_c42_association" varchar(8);--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "c42_associated_companies" text;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN IF NOT EXISTS "contract_information" text;
