CREATE TABLE "class_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text DEFAULT 'customer' NOT NULL,
	"pay_with" text,
	"pass_id" uuid,
	"membership_id" uuid,
	"credit_returned" boolean DEFAULT false NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"waitlisted_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"fee_charged_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"membership_id" uuid,
	"pass_id" uuid,
	"booking_id" uuid,
	"period_start" date,
	"period_end" date,
	"amount_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"price_cents" integer NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"term_months" integer,
	"classes_per_month" integer,
	"start_date" date NOT NULL,
	"term_ends_on" date,
	"current_period_start" date,
	"current_period_end" date,
	"next_billing_date" date,
	"frozen_from" date,
	"frozen_until" date,
	"freezes_used" integer DEFAULT 0 NOT NULL,
	"cancel_effective_on" date,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" text,
	"agreement_text" text NOT NULL,
	"agreement_accepted_at" timestamp with time zone,
	"cooling_off_ends_on" date,
	"renewal_notice_sent_at" timestamp with time zone,
	"decline_renewal" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" text,
	"payment_method_id" text,
	"payment_method_brand" text,
	"payment_method_last4" text,
	"setup_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"credits_total" integer NOT NULL,
	"credits_left" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"intro_offer" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"credits" integer,
	"valid_days" integer,
	"intro_only" boolean DEFAULT false NOT NULL,
	"term_months" integer,
	"classes_per_month" integer,
	"taxable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"class_type_id" uuid,
	"name" text NOT NULL,
	"instructor_name" text,
	"room" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"series_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_settings" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"cancel_window_hours" integer DEFAULT 12 NOT NULL,
	"late_fee_cents" integer DEFAULT 0 NOT NULL,
	"waitlist_cutoff_minutes" integer DEFAULT 120 NOT NULL,
	"freeze_max_days" integer DEFAULT 30 NOT NULL,
	"freezes_per_year" integer DEFAULT 2 NOT NULL,
	"renewal_notice_days" integer DEFAULT 60 NOT NULL,
	"terms_note" text,
	"award_on_check_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"capacity" integer DEFAULT 16 NOT NULL,
	"women_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_pass_id_class_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."class_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_bookings" ADD CONSTRAINT "class_bookings_membership_id_class_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."class_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_charges" ADD CONSTRAINT "class_charges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_charges" ADD CONSTRAINT "class_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_charges" ADD CONSTRAINT "class_charges_membership_id_class_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."class_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_charges" ADD CONSTRAINT "class_charges_pass_id_class_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."class_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_charges" ADD CONSTRAINT "class_charges_booking_id_class_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."class_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_product_id_class_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."class_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_passes" ADD CONSTRAINT "class_passes_product_id_class_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."class_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_products" ADD CONSTRAINT "class_products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_type_id_class_types_id_fk" FOREIGN KEY ("class_type_id") REFERENCES "public"."class_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_settings" ADD CONSTRAINT "class_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_types" ADD CONSTRAINT "class_types_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_bookings_live_uq" ON "class_bookings" USING btree ("session_id","user_id") WHERE "class_bookings"."status" in ('held', 'booked', 'waitlisted', 'attended');--> statement-breakpoint
CREATE INDEX "class_bookings_session_idx" ON "class_bookings" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "class_bookings_user_idx" ON "class_bookings" USING btree ("user_id","merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_charges_period_uq" ON "class_charges" USING btree ("membership_id","period_start");--> statement-breakpoint
CREATE INDEX "class_charges_merchant_idx" ON "class_charges" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "class_charges_user_idx" ON "class_charges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "class_memberships_merchant_idx" ON "class_memberships" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "class_memberships_user_idx" ON "class_memberships" USING btree ("user_id","merchant_id");--> statement-breakpoint
CREATE INDEX "class_memberships_billing_idx" ON "class_memberships" USING btree ("status","next_billing_date");--> statement-breakpoint
CREATE INDEX "class_passes_user_idx" ON "class_passes" USING btree ("user_id","merchant_id","status");--> statement-breakpoint
CREATE INDEX "class_passes_merchant_idx" ON "class_passes" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "class_products_merchant_idx" ON "class_products" USING btree ("merchant_id","kind","active");--> statement-breakpoint
CREATE INDEX "class_sessions_merchant_starts_idx" ON "class_sessions" USING btree ("merchant_id","starts_at");--> statement-breakpoint
CREATE INDEX "class_types_merchant_idx" ON "class_types" USING btree ("merchant_id","active");