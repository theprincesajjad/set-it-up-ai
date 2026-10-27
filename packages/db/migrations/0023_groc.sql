CREATE TABLE "grocery_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"price_cents" integer NOT NULL,
	"price_unit" text DEFAULT 'each' NOT NULL,
	"pack_size_g" integer,
	"was_price_cents" integer,
	"member_only" boolean DEFAULT false NOT NULL,
	"limit_per_customer" integer,
	"season_id" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"pantry_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_bought_at" timestamp with time zone NOT NULL,
	"interval_days" integer NOT NULL,
	"remind" boolean DEFAULT false NOT NULL,
	"remind_consent_at" timestamp with time zone,
	"remind_consent_source" text,
	"remind_consent_by" uuid,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_interval_days" integer DEFAULT 42 NOT NULL,
	"catalog_item_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "weight_unit" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "unit_price_cents" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "nominal_weight_g" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "weight_unit" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "per_unit_cents" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "actual_weight_g" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "weighed_cents" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "weighed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grocery_deals" ADD CONSTRAINT "grocery_deals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_entries" ADD CONSTRAINT "pantry_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_entries" ADD CONSTRAINT "pantry_entries_pantry_item_id_pantry_items_id_fk" FOREIGN KEY ("pantry_item_id") REFERENCES "public"."pantry_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_entries" ADD CONSTRAINT "pantry_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_entries" ADD CONSTRAINT "pantry_entries_remind_consent_by_users_id_fk" FOREIGN KEY ("remind_consent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_reminders" ADD CONSTRAINT "pantry_reminders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_reminders" ADD CONSTRAINT "pantry_reminders_entry_id_pantry_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."pantry_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grocery_deals_merchant_idx" ON "grocery_deals" USING btree ("merchant_id","starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_entries_item_user_uq" ON "pantry_entries" USING btree ("pantry_item_id","user_id");--> statement-breakpoint
CREATE INDEX "pantry_entries_merchant_idx" ON "pantry_entries" USING btree ("merchant_id","remind");--> statement-breakpoint
CREATE INDEX "pantry_items_merchant_idx" ON "pantry_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "pantry_reminders_merchant_idx" ON "pantry_reminders" USING btree ("merchant_id","sent_at");