CREATE TYPE "public"."restaurant_tier" AS ENUM('starter', 'growth', 'pro');--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'whatsapp';--> statement-breakpoint
CREATE TABLE "catering_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"event_type" text DEFAULT 'other' NOT NULL,
	"event_date" date NOT NULL,
	"start_time" text,
	"headcount" integer NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"service" text DEFAULT 'delivery' NOT NULL,
	"status" text DEFAULT 'inquiry' NOT NULL,
	"menu" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"per_head_cents" integer DEFAULT 0 NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_bps" integer DEFAULT 3000 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"dietary_notes" text,
	"notes" text,
	"tasting_at" timestamp with time zone,
	"approval_token" text NOT NULL,
	"quote_sent_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"signature_name" text,
	"signature_ip" text,
	"signature_user_agent" text,
	"deposit_payment_intent_id" text,
	"deposit_paid_at" timestamp with time zone,
	"invoice_id" uuid,
	"hall_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hall_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hall_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text DEFAULT 'other' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"headcount" integer NOT NULL,
	"package_name" text,
	"status" text DEFAULT 'hold' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"deposit_payment_intent_id" text,
	"deposit_paid_at" timestamp with time zone,
	"catering_event_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "halls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"description" text,
	"base_cents" integer DEFAULT 0 NOT NULL,
	"packages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deposit_bps" integer DEFAULT 2500 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_add_ons" (
	"merchant_id" uuid NOT NULL,
	"add_on_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_subscription_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_add_ons_merchant_id_add_on_id_pk" PRIMARY KEY("merchant_id","add_on_id")
);
--> statement-breakpoint
CREATE TABLE "order_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"pay_token" text NOT NULL,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"from_phone" text NOT NULL,
	"language" text,
	"transcript" text,
	"draft_order" jsonb,
	"order_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"provider_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"channel" text NOT NULL,
	"token" text NOT NULL,
	"rating" integer,
	"feedback" text,
	"sent_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"route_id" uuid,
	"date" date NOT NULL,
	"servings" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"stop_order" integer,
	"delivered_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"plan_id" uuid,
	"date" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cadence" text DEFAULT 'monthly' NOT NULL,
	"days_of_week" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"meals_per_day" integer DEFAULT 1 NOT NULL,
	"price_cents" integer NOT NULL,
	"extra_serving_cents" integer DEFAULT 0 NOT NULL,
	"max_servings" integer DEFAULT 6 NOT NULL,
	"dietary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_fee_cents" integer DEFAULT 0 NOT NULL,
	"pickup_allowed" boolean DEFAULT true NOT NULL,
	"delivery_allowed" boolean DEFAULT true NOT NULL,
	"cutoff_hours" integer DEFAULT 24 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"driver_name" text,
	"driver_phone" text,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_skips" (
	"subscription_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiffin_skips_subscription_id_date_pk" PRIMARY KEY("subscription_id","date")
);
--> statement-breakpoint
CREATE TABLE "tiffin_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"servings" integer DEFAULT 1 NOT NULL,
	"fulfilment" text DEFAULT 'delivery' NOT NULL,
	"address" text,
	"address_notes" text,
	"postal_code" text,
	"lat" double precision,
	"lng" double precision,
	"route_id" uuid,
	"stop_order" integer,
	"dietary_notes" text,
	"start_date" date NOT NULL,
	"paused_until" date,
	"current_period_start" date,
	"current_period_end" date,
	"next_billing_date" date,
	"price_cents" integer NOT NULL,
	"payment_method" text DEFAULT 'card' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"user_id" uuid,
	"state" text DEFAULT 'browsing' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"cart" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order_id" uuid,
	"last_inbound_at" timestamp with time zone,
	"marketing_opt_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "dietary" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "preorder_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "lead_time_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "serves" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "deposit_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "catering_event_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "hall_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "merchant_staff" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_staff" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "restaurant_tier" "restaurant_tier";--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "founding_offer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "cash_discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "charge_mode" text DEFAULT 'destination' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "whatsapp_number" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "whatsapp_credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "whatsapp_credits_extra" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "google_review_url" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "kitchen_status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "kind" text DEFAULT 'pickup' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cash_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bumped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "restaurant_tier" "restaurant_tier";--> statement-breakpoint
ALTER TABLE "catering_events" ADD CONSTRAINT "catering_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_events" ADD CONSTRAINT "catering_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD CONSTRAINT "hall_bookings_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD CONSTRAINT "hall_bookings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD CONSTRAINT "hall_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halls" ADD CONSTRAINT "halls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_add_ons" ADD CONSTRAINT "merchant_add_ons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_calls" ADD CONSTRAINT "phone_calls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD CONSTRAINT "tiffin_charges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD CONSTRAINT "tiffin_charges_subscription_id_tiffin_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tiffin_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_deliveries" ADD CONSTRAINT "tiffin_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_deliveries" ADD CONSTRAINT "tiffin_deliveries_subscription_id_tiffin_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tiffin_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_deliveries" ADD CONSTRAINT "tiffin_deliveries_route_id_tiffin_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."tiffin_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_menus" ADD CONSTRAINT "tiffin_menus_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_menus" ADD CONSTRAINT "tiffin_menus_plan_id_tiffin_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tiffin_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_plans" ADD CONSTRAINT "tiffin_plans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_routes" ADD CONSTRAINT "tiffin_routes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_skips" ADD CONSTRAINT "tiffin_skips_subscription_id_tiffin_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tiffin_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD CONSTRAINT "tiffin_subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD CONSTRAINT "tiffin_subscriptions_plan_id_tiffin_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tiffin_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD CONSTRAINT "tiffin_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD CONSTRAINT "tiffin_subscriptions_route_id_tiffin_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."tiffin_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catering_events_token_uq" ON "catering_events" USING btree ("approval_token");--> statement-breakpoint
CREATE INDEX "catering_events_merchant_idx" ON "catering_events" USING btree ("merchant_id","event_date");--> statement-breakpoint
CREATE INDEX "hall_bookings_hall_idx" ON "hall_bookings" USING btree ("hall_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_splits_token_uq" ON "order_splits" USING btree ("pay_token");--> statement-breakpoint
CREATE INDEX "order_splits_order_idx" ON "order_splits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "phone_calls_merchant_idx" ON "phone_calls" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_token_uq" ON "review_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "review_requests_merchant_idx" ON "review_requests" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tiffin_charges_period_uq" ON "tiffin_charges" USING btree ("subscription_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "tiffin_deliveries_uq" ON "tiffin_deliveries" USING btree ("subscription_id","date");--> statement-breakpoint
CREATE INDEX "tiffin_deliveries_day_idx" ON "tiffin_deliveries" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "tiffin_menus_uq" ON "tiffin_menus" USING btree ("merchant_id","plan_id","date");--> statement-breakpoint
CREATE INDEX "tiffin_plans_merchant_idx" ON "tiffin_plans" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "tiffin_subs_merchant_idx" ON "tiffin_subscriptions" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "tiffin_subs_user_idx" ON "tiffin_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_sessions_uq" ON "whatsapp_sessions" USING btree ("merchant_id","phone");