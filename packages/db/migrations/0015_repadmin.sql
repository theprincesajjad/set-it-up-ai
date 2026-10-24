CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "setup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "setup_channel" text;--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD COLUMN "opens_on" date;--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD COLUMN "street_day_on" date;--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD COLUMN "street_day_rep_id" uuid;--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD COLUMN "target_shops" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_sessions_merchant_idx" ON "support_sessions" USING btree ("merchant_id","started_at");--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD CONSTRAINT "neighbourhoods_street_day_rep_id_users_id_fk" FOREIGN KEY ("street_day_rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_activities_client_uq" ON "lead_activities" USING btree ("client_id");