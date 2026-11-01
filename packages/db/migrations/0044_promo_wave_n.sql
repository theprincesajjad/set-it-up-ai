-- Wave N promo team: owner-shaped promos (type, segment, quantity cap, channels, pause), claims and deliveries, and the AI key settings and metering.
ALTER TABLE "promos" ADD COLUMN "promo_type" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "segment" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "quantity_cap" integer;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "claimed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "holiday" text;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "channels" jsonb DEFAULT '["inbox","push"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "notify_text" text;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "ended_early_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "duplicated_from" uuid;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "ai_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promos" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_claimed_within_cap_chk" CHECK ("quantity_cap" IS NULL OR "claimed_count" <= "quantity_cap");--> statement-breakpoint
CREATE TABLE "promo_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"code" text NOT NULL,
	"amount_cents" integer,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "promo_claims" ADD CONSTRAINT "promo_claims_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_claims" ADD CONSTRAINT "promo_claims_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_claims" ADD CONSTRAINT "promo_claims_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_claims" ADD CONSTRAINT "promo_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_claims" ADD CONSTRAINT "promo_claims_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_claims_member_uq" ON "promo_claims" USING btree ("promo_id","member_id");--> statement-breakpoint
CREATE INDEX "promo_claims_merchant_idx" ON "promo_claims" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE TABLE "promo_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'announce' NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"skip_reason" text,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "promo_deliveries" ADD CONSTRAINT "promo_deliveries_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_deliveries" ADD CONSTRAINT "promo_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_deliveries" ADD CONSTRAINT "promo_deliveries_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_deliveries" ADD CONSTRAINT "promo_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_deliveries_once_uq" ON "promo_deliveries" USING btree ("promo_id","member_id","kind");--> statement-breakpoint
CREATE INDEX "promo_deliveries_cap_idx" ON "promo_deliveries" USING btree ("merchant_id","user_id","created_at");--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"encrypted_key" text,
	"key_last4" text,
	"key_set_at" timestamp with time zone,
	"key_set_by" uuid,
	"key_validated_at" timestamp with time zone,
	"model" text,
	"monthly_spend_cap_cents" integer DEFAULT 5000 NOT NULL,
	"shop_generations_per_month" integer DEFAULT 60 NOT NULL,
	"shop_tokens_per_month" integer DEFAULT 300000 NOT NULL,
	"free_generations_per_month" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_key_set_by_users_id_fk" FOREIGN KEY ("key_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"outcome" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_merchant_idx" ON "ai_usage" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");
