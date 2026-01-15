CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."org_member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('tax_return', 'validation', 'submission', 'amendment', 'inquiry');--> statement-breakpoint
CREATE TYPE "public"."tax_return_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'review_required');--> statement-breakpoint
CREATE TYPE "public"."tax_sync_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "lts_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(256),
	"avatar_url" text,
	"phone" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_account_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "lts_global_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "lts_global_admin_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "lts_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_url" text,
	"metadata" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"job_number" integer NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"ai_model" varchar(128),
	"credentials_snapshot" text,
	"ecs_task_arn" varchar(512),
	"cloudwatch_log_group" varchar(256),
	"cloudwatch_log_stream" varchar(512),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"result_data" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_jurisdiction_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"org_id" uuid,
	"portal_credentials_encrypted" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_jurisdiction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(8) NOT NULL,
	"name" varchar(128) NOT NULL,
	"country" varchar(128),
	"portal_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_jurisdiction_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lts_org_member_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_member_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lts_org_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "org_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_org_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"default_ai_model" varchar(128),
	"webhook_url" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_org_setting_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "lts_organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_organisation_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lts_pending_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(256) NOT NULL,
	"role" "org_member_role" DEFAULT 'member' NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"token" varchar(64) NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lts_pending_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "lts_substance_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_return_id" uuid NOT NULL,
	"entity_name" varchar(256),
	"entity_type" varchar(64),
	"accounting_period_start" varchar(16),
	"accounting_period_end" varchar(16),
	"is_civ" varchar(8),
	"company_number" varchar(64),
	"tax_reference_number" varchar(64),
	"registered_address" text,
	"principal_place_of_business" text,
	"partnership_name" varchar(256),
	"partnership_number" varchar(64),
	"fin_stmt_consolidated" varchar(8),
	"accounts_preparer_name" varchar(256),
	"accounts_preparer_qual" varchar(128),
	"is_gsy_fi_fatca" varchar(8),
	"is_gsy_fi_crs" varchar(8),
	"relevant_activity" varchar(128),
	"has_multiple_activities" varchar(8),
	"ciga_performed" text,
	"ciga_details" text,
	"employees" jsonb,
	"total_fte" integer,
	"total_qualified_fte" integer,
	"has_ciga_outsourcing" varchar(8),
	"outsourcing_details" text,
	"immediate_parents" jsonb,
	"ultimate_parents" jsonb,
	"ubos" jsonb,
	"all_meetings_in_gsy" varchar(8),
	"total_board_meetings" integer,
	"board_meetings_in_gsy" integer,
	"adequate_meeting_freq" varchar(8),
	"enough_directors_present" varchar(8),
	"directors_have_expertise" varchar(8),
	"strategic_decisions_gsy" varchar(8),
	"records_maintained_gsy" varchar(8),
	"board_meeting_location" varchar(256),
	"directors" jsonb,
	"board_meetings" jsonb,
	"prepared_by" varchar(256),
	"prepared_date" varchar(16),
	"manager_sign_off" varchar(256),
	"manager_sign_off_date" varchar(16),
	"is_complete" boolean DEFAULT false,
	"missing_fields" jsonb,
	"ai_extracted_at" timestamp with time zone,
	"last_edited_at" timestamp with time zone,
	"last_edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lts_substance_form_tax_return_id_unique" UNIQUE("tax_return_id")
);
--> statement-breakpoint
CREATE TABLE "lts_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"tax_return_id" uuid,
	"name" varchar(256) NOT NULL,
	"description" text,
	"task_type" "task_type" DEFAULT 'tax_return' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"pdf_urls" jsonb,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_tax_return" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"entity_name" varchar(256) NOT NULL,
	"tax_year" integer NOT NULL,
	"status" "tax_return_status" DEFAULT 'pending' NOT NULL,
	"external_id" varchar(128),
	"link" text,
	"pdf_url" text,
	"files" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_tax_sync_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"status" "tax_sync_job_status" DEFAULT 'pending' NOT NULL,
	"ecs_task_arn" varchar(512),
	"cloudwatch_log_group" varchar(256),
	"cloudwatch_log_stream" varchar(512),
	"returns_found" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lts_global_admin" ADD CONSTRAINT "lts_global_admin_account_id_lts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."lts_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_global_admin" ADD CONSTRAINT "lts_global_admin_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_invoice" ADD CONSTRAINT "lts_invoice_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_invoice" ADD CONSTRAINT "lts_invoice_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_job" ADD CONSTRAINT "lts_job_task_id_lts_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."lts_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_job" ADD CONSTRAINT "lts_job_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_jurisdiction_setting" ADD CONSTRAINT "lts_jurisdiction_setting_jurisdiction_id_lts_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."lts_jurisdiction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_jurisdiction_setting" ADD CONSTRAINT "lts_jurisdiction_setting_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_org_member_permission" ADD CONSTRAINT "lts_org_member_permission_org_member_id_lts_org_member_id_fk" FOREIGN KEY ("org_member_id") REFERENCES "public"."lts_org_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_org_member" ADD CONSTRAINT "lts_org_member_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_org_member" ADD CONSTRAINT "lts_org_member_account_id_lts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."lts_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_org_setting" ADD CONSTRAINT "lts_org_setting_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" ADD CONSTRAINT "lts_pending_invitation_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" ADD CONSTRAINT "lts_pending_invitation_invited_by_lts_account_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD CONSTRAINT "lts_substance_form_tax_return_id_lts_tax_return_id_fk" FOREIGN KEY ("tax_return_id") REFERENCES "public"."lts_tax_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD CONSTRAINT "lts_substance_form_last_edited_by_lts_account_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_task" ADD CONSTRAINT "lts_task_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_task" ADD CONSTRAINT "lts_task_jurisdiction_id_lts_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."lts_jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_task" ADD CONSTRAINT "lts_task_tax_return_id_lts_tax_return_id_fk" FOREIGN KEY ("tax_return_id") REFERENCES "public"."lts_tax_return"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_task" ADD CONSTRAINT "lts_task_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_tax_return" ADD CONSTRAINT "lts_tax_return_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_tax_return" ADD CONSTRAINT "lts_tax_return_jurisdiction_id_lts_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."lts_jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job" ADD CONSTRAINT "lts_tax_sync_job_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job" ADD CONSTRAINT "lts_tax_sync_job_jurisdiction_id_lts_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."lts_jurisdiction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_tax_sync_job" ADD CONSTRAINT "lts_tax_sync_job_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lts_account_user_id_idx" ON "lts_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_global_admin_account_idx" ON "lts_global_admin" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "lts_invoice_org_idx" ON "lts_invoice" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_invoice_status_idx" ON "lts_invoice" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_invoice_number_idx" ON "lts_invoice" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "lts_job_task_idx" ON "lts_job" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "lts_job_status_idx" ON "lts_job" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_job_task_number_idx" ON "lts_job" USING btree ("task_id","job_number");--> statement-breakpoint
CREATE INDEX "lts_jurisdiction_setting_jurisdiction_idx" ON "lts_jurisdiction_setting" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "lts_jurisdiction_setting_org_idx" ON "lts_jurisdiction_setting" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_jurisdiction_setting_unique_idx" ON "lts_jurisdiction_setting" USING btree ("jurisdiction_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_jurisdiction_code_idx" ON "lts_jurisdiction" USING btree ("code");--> statement-breakpoint
CREATE INDEX "lts_org_member_permission_member_idx" ON "lts_org_member_permission" USING btree ("org_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_org_member_permission_unique_idx" ON "lts_org_member_permission" USING btree ("org_member_id","permission");--> statement-breakpoint
CREATE INDEX "lts_org_member_org_idx" ON "lts_org_member" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_org_member_account_idx" ON "lts_org_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_org_member_unique_idx" ON "lts_org_member" USING btree ("org_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_org_setting_org_idx" ON "lts_org_setting" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_organisation_slug_idx" ON "lts_organisation" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "lts_pending_invitation_org_idx" ON "lts_pending_invitation" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_pending_invitation_email_idx" ON "lts_pending_invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_pending_invitation_token_idx" ON "lts_pending_invitation" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_pending_invitation_org_email_idx" ON "lts_pending_invitation" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_substance_form_tax_return_idx" ON "lts_substance_form" USING btree ("tax_return_id");--> statement-breakpoint
CREATE INDEX "lts_substance_form_complete_idx" ON "lts_substance_form" USING btree ("is_complete");--> statement-breakpoint
CREATE INDEX "lts_task_org_idx" ON "lts_task" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_task_jurisdiction_idx" ON "lts_task" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "lts_task_tax_return_idx" ON "lts_task" USING btree ("tax_return_id");--> statement-breakpoint
CREATE INDEX "lts_task_status_idx" ON "lts_task" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lts_task_created_by_idx" ON "lts_task" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "lts_tax_return_org_idx" ON "lts_tax_return" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_tax_return_external_id_idx" ON "lts_tax_return" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "lts_tax_sync_job_org_idx" ON "lts_tax_sync_job" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_tax_sync_job_status_idx" ON "lts_tax_sync_job" USING btree ("status");