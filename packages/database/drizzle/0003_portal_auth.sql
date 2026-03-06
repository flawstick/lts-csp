CREATE TYPE "public"."account_type" AS ENUM('internal', 'portal', 'dual');--> statement-breakpoint
CREATE TYPE "public"."portal_membership_role" AS ENUM('viewer', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."portal_membership_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."portal_invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint

ALTER TABLE "lts_account"
ADD COLUMN "account_type" "account_type" DEFAULT 'internal' NOT NULL;--> statement-breakpoint

UPDATE "lts_account"
SET "account_type" = 'internal'
WHERE "account_type" IS NULL;--> statement-breakpoint

CREATE TABLE "lts_portal_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "portal_membership_role" DEFAULT 'viewer' NOT NULL,
	"status" "portal_membership_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "lts_portal_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(256) NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" "portal_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lts_portal_invitation_token_unique" UNIQUE("token")
);--> statement-breakpoint

ALTER TABLE "lts_portal_membership"
ADD CONSTRAINT "lts_portal_membership_account_id_lts_account_id_fk"
FOREIGN KEY ("account_id") REFERENCES "public"."lts_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "lts_portal_membership"
ADD CONSTRAINT "lts_portal_membership_org_id_lts_organisation_id_fk"
FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "lts_portal_membership"
ADD CONSTRAINT "lts_portal_membership_invited_by_lts_account_id_fk"
FOREIGN KEY ("invited_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "lts_portal_invitation"
ADD CONSTRAINT "lts_portal_invitation_org_id_lts_organisation_id_fk"
FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "lts_portal_invitation"
ADD CONSTRAINT "lts_portal_invitation_invited_by_lts_account_id_fk"
FOREIGN KEY ("invited_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "lts_portal_membership_account_org_idx" ON "lts_portal_membership" USING btree ("account_id","org_id");--> statement-breakpoint
CREATE INDEX "lts_portal_membership_account_idx" ON "lts_portal_membership" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "lts_portal_membership_org_idx" ON "lts_portal_membership" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_portal_membership_status_idx" ON "lts_portal_membership" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_portal_invitation_token_idx" ON "lts_portal_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "lts_portal_invitation_email_status_idx" ON "lts_portal_invitation" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "lts_portal_invitation_org_idx" ON "lts_portal_invitation" USING btree ("org_id");
