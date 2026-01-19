ALTER TABLE "lts_org_member_permission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lts_org_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "lts_org_member_permission" CASCADE;--> statement-breakpoint
DROP TABLE "lts_org_member" CASCADE;--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" DROP CONSTRAINT "lts_pending_invitation_email_unique";--> statement-breakpoint
ALTER TABLE "lts_substance_form" ALTER COLUMN "total_fte" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "lts_substance_form" ALTER COLUMN "total_qualified_fte" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" ADD COLUMN "role" "org_member_role" DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "lts_substance_form" ADD COLUMN "activity_gross_income" varchar(64);--> statement-breakpoint
ALTER TABLE "lts_pending_invitation" ADD CONSTRAINT "lts_pending_invitation_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lts_pending_invitation_org_idx" ON "lts_pending_invitation" USING btree ("org_id");