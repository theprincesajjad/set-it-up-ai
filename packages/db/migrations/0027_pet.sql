CREATE TABLE "daycare_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"days_total" integer NOT NULL,
	"days_used" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sold_by" uuid
);
--> statement-breakpoint
CREATE TABLE "daycare_stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	"pack_id" uuid,
	"pay_kind" text DEFAULT 'drop_in' NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"sku_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"punches" integer DEFAULT 0 NOT NULL,
	"given" integer DEFAULT 0 NOT NULL,
	"cycle_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_bag_at" timestamp with time zone DEFAULT now() NOT NULL,
	"daily_grams" integer,
	"remind" boolean DEFAULT false NOT NULL,
	"remind_consent_at" timestamp with time zone,
	"remind_consent_source" text,
	"remind_consent_by" uuid,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"staff_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"buy_count" integer DEFAULT 12 NOT NULL,
	"expiry_months" integer DEFAULT 12 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_skus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bag_grams" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"since_visit_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_settings" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"capacity" integer DEFAULT 16 NOT NULL,
	"dogs_per_staff" integer DEFAULT 15 NOT NULL,
	"staff_on" integer DEFAULT 1 NOT NULL,
	"required_vaccines" jsonb DEFAULT '["rabies","dhpp","bordetella"]'::jsonb NOT NULL,
	"require_assessment" boolean DEFAULT true NOT NULL,
	"drop_in_cents" integer DEFAULT 4800 NOT NULL,
	"packs" jsonb DEFAULT '[{"days":5,"priceCents":22000,"validDays":120},{"days":10,"priceCents":42000,"validDays":180}]'::jsonb NOT NULL,
	"closes_at" text DEFAULT '18:00' NOT NULL,
	"late_grace_min" integer DEFAULT 15 NOT NULL,
	"auto_groom_reminders" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_shop" (
	"merchant_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"groom_every_weeks" integer,
	"handling_note" text,
	"assessment" text DEFAULT 'none' NOT NULL,
	"assessed_at" timestamp with time zone,
	"assessed_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_shop_merchant_id_pet_id_pk" PRIMARY KEY("merchant_id","pet_id")
);
--> statement-breakpoint
CREATE TABLE "pet_vaccines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"expires_on" date NOT NULL,
	"proof_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'groom' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"mood" text,
	"did" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"photo_url" text,
	"token" text,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text DEFAULT 'dog' NOT NULL,
	"breed" text,
	"size_band" text DEFAULT 'medium' NOT NULL,
	"coat" text DEFAULT 'short' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daycare_packs" ADD CONSTRAINT "daycare_packs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_packs" ADD CONSTRAINT "daycare_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_packs" ADD CONSTRAINT "daycare_packs_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_stays" ADD CONSTRAINT "daycare_stays_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_stays" ADD CONSTRAINT "daycare_stays_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_stays" ADD CONSTRAINT "daycare_stays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daycare_stays" ADD CONSTRAINT "daycare_stays_pack_id_daycare_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."daycare_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_program_id_food_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."food_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_sku_id_food_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."food_skus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_cards" ADD CONSTRAINT "food_cards_remind_consent_by_users_id_fk" FOREIGN KEY ("remind_consent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_events" ADD CONSTRAINT "food_events_card_id_food_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."food_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_events" ADD CONSTRAINT "food_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_events" ADD CONSTRAINT "food_events_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_programs" ADD CONSTRAINT "food_programs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_skus" ADD CONSTRAINT "food_skus_program_id_food_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."food_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_skus" ADD CONSTRAINT "food_skus_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_nudges" ADD CONSTRAINT "pet_nudges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_nudges" ADD CONSTRAINT "pet_nudges_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_nudges" ADD CONSTRAINT "pet_nudges_since_visit_id_pet_visits_id_fk" FOREIGN KEY ("since_visit_id") REFERENCES "public"."pet_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_settings" ADD CONSTRAINT "pet_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop" ADD CONSTRAINT "pet_shop_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop" ADD CONSTRAINT "pet_shop_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_shop" ADD CONSTRAINT "pet_shop_assessed_by_users_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_vaccines" ADD CONSTRAINT "pet_vaccines_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_visits" ADD CONSTRAINT "pet_visits_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_visits" ADD CONSTRAINT "pet_visits_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_visits" ADD CONSTRAINT "pet_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_visits" ADD CONSTRAINT "pet_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daycare_packs_user_idx" ON "daycare_packs" USING btree ("merchant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daycare_stays_pet_day_uq" ON "daycare_stays" USING btree ("merchant_id","pet_id","day");--> statement-breakpoint
CREATE INDEX "daycare_stays_day_idx" ON "daycare_stays" USING btree ("merchant_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "food_cards_user_sku_uq" ON "food_cards" USING btree ("user_id","sku_id");--> statement-breakpoint
CREATE INDEX "food_cards_merchant_idx" ON "food_cards" USING btree ("merchant_id","remind");--> statement-breakpoint
CREATE INDEX "food_events_card_idx" ON "food_events" USING btree ("card_id","at");--> statement-breakpoint
CREATE INDEX "food_programs_merchant_idx" ON "food_programs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "food_skus_program_idx" ON "food_skus" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "pet_nudges_pet_idx" ON "pet_nudges" USING btree ("merchant_id","pet_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_vaccines_pet_kind_uq" ON "pet_vaccines" USING btree ("pet_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_visits_token_uq" ON "pet_visits" USING btree ("token");--> statement-breakpoint
CREATE INDEX "pet_visits_pet_idx" ON "pet_visits" USING btree ("pet_id","at");--> statement-breakpoint
CREATE INDEX "pet_visits_merchant_idx" ON "pet_visits" USING btree ("merchant_id","at");--> statement-breakpoint
CREATE INDEX "pets_user_idx" ON "pets" USING btree ("user_id");