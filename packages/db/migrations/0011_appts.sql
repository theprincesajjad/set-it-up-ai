CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid,
	"customer_name" text,
	"staff_id" uuid,
	"requested_staff" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"group_id" uuid,
	"notes" text,
	"client_note" text,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"deposit_payment_intent_id" text,
	"deposit_processing_at" timestamp with time zone,
	"deposit_paid_at" timestamp with time zone,
	"stripe_customer_id" text,
	"card_setup_intent_id" text,
	"payment_method_id" text,
	"no_show_fee_cents" integer,
	"fee_charged_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"invoice_id" uuid,
	"reminder_24_sent_at" timestamp with time zone,
	"reminder_2_sent_at" timestamp with time zone,
	"rebook_nudge_sent_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "busy_mode_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"add_minutes" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"until" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "festival_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"festival_id" text NOT NULL,
	"year" integer NOT NULL,
	"template_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"instalment_index" integer,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_on" date NOT NULL,
	"bank_reference" text,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by" uuid
);
--> statement-breakpoint
CREATE TABLE "preorder_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"item_id" uuid,
	"date" date NOT NULL,
	"user_id" uuid,
	"phone" text NOT NULL,
	"name" text,
	"consent_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rebooking_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"action" text NOT NULL,
	"channel" text,
	"until" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text DEFAULT 'appointment' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"price_from" boolean DEFAULT false NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"buffer_min" integer DEFAULT 0 NOT NULL,
	"category_id" uuid,
	"rebook_after_days" integer,
	"taxable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"starts_local" time NOT NULL,
	"ends_local" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"duration_min" integer,
	"price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_services_user_id_service_id_pk" PRIMARY KEY("user_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "staff_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiffin_driver_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"date" date NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"last_opened_at" timestamp with time zone,
	"last_late_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"sender" text,
	"sent_by_user_id" uuid,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "cook_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "recipe" jsonb;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "sold_out_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "service_charge_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "reference_code" text;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "deposit_method" text;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "deposit_received_on" date;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "quote_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "reference_code" text;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "last_reminder_key" text;--> statement-breakpoint
ALTER TABLE "halls" ADD COLUMN "payment_schedule" jsonb;--> statement-breakpoint
ALTER TABLE "halls" ADD COLUMN "auto_confirm_on_first_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tip_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_role" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "event_date" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "board_meeting_at" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "member_count" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "preorder_cap_by_weekday" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "preorder_per_hour_cap" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "preorder_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "busy_add_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "busy_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "cuisines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "festival_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "halal_certification" jsonb;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "halal_reminders" jsonb;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "preorder_cancel_cutoff_hours" integer;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "intake_terms" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tips_enabled" boolean;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tip_presets" jsonb DEFAULT '[15,20,25]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "rebook_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "dropoff_slot_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "dropoff_capacity" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "dropoff_days_ahead" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "cancel_window_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "no_show_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "payment_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tax_registered" boolean;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tax_number" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tax_small_supplier_note" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "food_handler_expiry" date;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "health_unit" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "health_unit_notified_on" date;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "food_handler_badge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "neighbourhoods" ADD COLUMN "bia_member_count" integer;--> statement-breakpoint
ALTER TABLE "order_splits" ADD COLUMN "tender" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "allergy_note" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "authorized_by" jsonb;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "google_clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "reply_channel" text;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "reply_body" text;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "offer_redemption_id" uuid;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "intake_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "shelf_location" text;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "status_token" text;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "pickup_reminder_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "lien_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD COLUMN "lien_notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "tax_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "reference_code" text;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "reminder_stage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tiffin_charges" ADD COLUMN "received_on" date;--> statement-breakpoint
ALTER TABLE "tiffin_plans" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN "taken_over_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN "taken_over_by" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD COLUMN "allergy_note" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "busy_mode_events" ADD CONSTRAINT "busy_mode_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "busy_mode_events" ADD CONSTRAINT "busy_mode_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_sends" ADD CONSTRAINT "festival_sends_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_waitlist" ADD CONSTRAINT "preorder_waitlist_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_waitlist" ADD CONSTRAINT "preorder_waitlist_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_waitlist" ADD CONSTRAINT "preorder_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebooking_nudges" ADD CONSTRAINT "rebooking_nudges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebooking_nudges" ADD CONSTRAINT "rebooking_nudges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_merchant_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."merchant_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_driver_links" ADD CONSTRAINT "tiffin_driver_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_driver_links" ADD CONSTRAINT "tiffin_driver_links_route_id_tiffin_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."tiffin_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiffin_driver_links" ADD CONSTRAINT "tiffin_driver_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_session_id_whatsapp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_merchant_starts_idx" ON "appointments" USING btree ("merchant_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_merchant_staff_starts_idx" ON "appointments" USING btree ("merchant_id","staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_user_starts_idx" ON "appointments" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "busy_mode_events_merchant_idx" ON "busy_mode_events" USING btree ("merchant_id","started_at");--> statement-breakpoint
CREATE INDEX "festival_sends_merchant_idx" ON "festival_sends" USING btree ("merchant_id","festival_id","year");--> statement-breakpoint
CREATE INDEX "manual_payments_subject_idx" ON "manual_payments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "manual_payments_merchant_idx" ON "manual_payments" USING btree ("merchant_id","received_on");--> statement-breakpoint
CREATE UNIQUE INDEX "preorder_waitlist_uq" ON "preorder_waitlist" USING btree ("merchant_id","date","phone");--> statement-breakpoint
CREATE INDEX "preorder_waitlist_day_idx" ON "preorder_waitlist" USING btree ("merchant_id","date");--> statement-breakpoint
CREATE INDEX "rebooking_nudges_merchant_idx" ON "rebooking_nudges" USING btree ("merchant_id","user_id","service_id","created_at");--> statement-breakpoint
CREATE INDEX "services_merchant_kind_idx" ON "services" USING btree ("merchant_id","kind","active");--> statement-breakpoint
CREATE INDEX "staff_hours_merchant_user_idx" ON "staff_hours" USING btree ("merchant_id","user_id","weekday");--> statement-breakpoint
CREATE INDEX "staff_services_merchant_idx" ON "staff_services" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "staff_time_off_merchant_user_idx" ON "staff_time_off" USING btree ("merchant_id","user_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tiffin_driver_links_token_uq" ON "tiffin_driver_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tiffin_driver_links_route_idx" ON "tiffin_driver_links" USING btree ("route_id","date");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_session_idx" ON "whatsapp_messages" USING btree ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tip_staff_id_users_id_fk" FOREIGN KEY ("tip_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_taken_over_by_users_id_fk" FOREIGN KEY ("taken_over_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catering_events_reference_uq" ON "catering_events" USING btree ("merchant_id","reference_code");--> statement-breakpoint
CREATE UNIQUE INDEX "hall_bookings_reference_uq" ON "hall_bookings" USING btree ("merchant_id","reference_code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_tickets_status_token_uq" ON "service_tickets" USING btree ("status_token");--> statement-breakpoint
CREATE UNIQUE INDEX "tiffin_charges_reference_uq" ON "tiffin_charges" USING btree ("merchant_id","reference_code");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ends_after_starts" CHECK ("ends_at" > "starts_at");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("staff_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("staff_id" IS NOT NULL AND "status" IN ('booked', 'arrived', 'in_service'));
