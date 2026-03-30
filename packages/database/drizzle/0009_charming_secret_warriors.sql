CREATE TYPE "public"."tax_sync_job_log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."tax_sync_job_trigger" AS ENUM('manual', 'scheduler');--> statement-breakpoint
CREATE TABLE "lts_tax_sync_job_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"level" "tax_sync_job_log_level" NOT NULL,
	"scope" varchar(256),
	"message" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job" ADD COLUMN "trigger" "tax_sync_job_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job_log" ADD CONSTRAINT "lts_tax_sync_job_log_job_id_lts_tax_sync_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."lts_tax_sync_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lts_tax_sync_job_log_job_idx" ON "lts_tax_sync_job_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "lts_tax_sync_job_log_created_idx" ON "lts_tax_sync_job_log" USING btree ("created_at");