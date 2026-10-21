CREATE TABLE "neighbourhood_managers" (
	"neighbourhood_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "neighbourhood_managers_neighbourhood_id_user_id_pk" PRIMARY KEY("neighbourhood_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "payment_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "accrued_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "ended_reason" text;--> statement-breakpoint
ALTER TABLE "ad_events" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "winner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "drawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "neighbourhood_managers" ADD CONSTRAINT "neighbourhood_managers_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbourhood_managers" ADD CONSTRAINT "neighbourhood_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighbourhood_managers" ADD CONSTRAINT "neighbourhood_managers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "neighbourhood_managers_user_idx" ON "neighbourhood_managers" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_winner_user_id_users_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_campaigns_merchant_idx" ON "ad_campaigns" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "ad_events_user_idx" ON "ad_events" USING btree ("user_id","ad_campaign_id","created_at");