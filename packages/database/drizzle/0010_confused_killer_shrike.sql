CREATE TABLE "lts_portal_client_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"normalized_entity_name" varchar(256) NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"primary_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lts_portal_return_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tax_return_id" uuid NOT NULL,
	"client_profile_id" uuid,
	"recipient_email" varchar(320) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lts_portal_client_profile" ADD CONSTRAINT "lts_portal_client_profile_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_portal_return_share" ADD CONSTRAINT "lts_portal_return_share_org_id_lts_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."lts_organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_portal_return_share" ADD CONSTRAINT "lts_portal_return_share_tax_return_id_lts_tax_return_id_fk" FOREIGN KEY ("tax_return_id") REFERENCES "public"."lts_tax_return"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_portal_return_share" ADD CONSTRAINT "lts_portal_return_share_client_profile_id_lts_portal_client_profile_id_fk" FOREIGN KEY ("client_profile_id") REFERENCES "public"."lts_portal_client_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lts_portal_return_share" ADD CONSTRAINT "lts_portal_return_share_created_by_lts_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."lts_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lts_portal_client_profile_org_idx" ON "lts_portal_client_profile" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_portal_client_profile_org_entity_idx" ON "lts_portal_client_profile" USING btree ("org_id","normalized_entity_name");--> statement-breakpoint
CREATE INDEX "lts_portal_return_share_org_idx" ON "lts_portal_return_share" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lts_portal_return_share_tax_return_idx" ON "lts_portal_return_share" USING btree ("tax_return_id");--> statement-breakpoint
CREATE INDEX "lts_portal_return_share_client_profile_idx" ON "lts_portal_return_share" USING btree ("client_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lts_portal_return_share_token_hash_idx" ON "lts_portal_return_share" USING btree ("token_hash");