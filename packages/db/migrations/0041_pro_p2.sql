-- Waitlist that fills cancelled slots (docs/business/pro-value.md §3.2 P2). A client asks for a spot on a full day; a cancellation
-- (a freed slot) is offered to the first match with a two-hour hold on Pro, Studio and the trial. Free records the asks and the slots.
CREATE TABLE "waitlist_freed_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"staff_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"freed_appointment_id" uuid,
	"reason" text DEFAULT 'cancelled' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"offers" integer DEFAULT 0 NOT NULL,
	"filled_appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid,
	"user_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"service_id" uuid NOT NULL,
	"staff_id" uuid,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"time_pref" text DEFAULT 'any' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"offered_appointment_hold_id" uuid,
	"offered_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"freed_slot_id" uuid,
	"offer_token" text,
	"booked_appointment_id" uuid,
	"booked_at" timestamp with time zone,
	"source" text DEFAULT 'online' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_freed_slots" ADD CONSTRAINT "waitlist_freed_slots_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_freed_slots" ADD CONSTRAINT "waitlist_freed_slots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_freed_slots" ADD CONSTRAINT "waitlist_freed_slots_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_freed_slot_id_waitlist_freed_slots_id_fk" FOREIGN KEY ("freed_slot_id") REFERENCES "public"."waitlist_freed_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_freed_slots_appt_uq" ON "waitlist_freed_slots" USING btree ("freed_appointment_id");--> statement-breakpoint
CREATE INDEX "waitlist_freed_slots_merchant_starts_idx" ON "waitlist_freed_slots" USING btree ("merchant_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_waitlist_merchant_status_idx" ON "appointment_waitlist" USING btree ("merchant_id","status","window_start");--> statement-breakpoint
CREATE INDEX "appointment_waitlist_user_idx" ON "appointment_waitlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_waitlist_token_uq" ON "appointment_waitlist" USING btree ("offer_token");--> statement-breakpoint
CREATE INDEX "appointment_waitlist_slot_idx" ON "appointment_waitlist" USING btree ("freed_slot_id");
