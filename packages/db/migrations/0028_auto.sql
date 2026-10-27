CREATE TABLE "auto_settings" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_reminders" boolean DEFAULT false NOT NULL,
	"default_km_per_day" integer DEFAULT 40 NOT NULL,
	"bays" integer DEFAULT 2 NOT NULL,
	"hours_per_day" integer DEFAULT 8 NOT NULL,
	"minutes_per_swap" integer DEFAULT 45 NOT NULL,
	"fall_start" text DEFAULT '10-15' NOT NULL,
	"fall_end" text DEFAULT '11-30' NOT NULL,
	"spring_start" text DEFAULT '03-25' NOT NULL,
	"spring_end" text DEFAULT '04-30' NOT NULL,
	"pickup_lead_days" integer DEFAULT 14 NOT NULL,
	"wash_max_per_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tire_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"rack" text NOT NULL,
	"season" text NOT NULL,
	"label" text,
	"tread_tenths_mm" integer,
	"stored_on" date NOT NULL,
	"status" text DEFAULT 'stored' NOT NULL,
	"picked_up_on" date,
	"pickup_nudged_for" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tire_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"day" date NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text DEFAULT 'customer' NOT NULL,
	"tire_set_id" uuid,
	"note" text,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"service_key" text NOT NULL,
	"due_on" date NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"merchant_id" uuid,
	"km" integer NOT NULL,
	"day" date NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"service_key" text NOT NULL,
	"done_on" date NOT NULL,
	"km" integer,
	"ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_shop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"km_per_day_override" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"use" text DEFAULT 'personal' NOT NULL,
	"plate" text,
	"plate_norm" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wash_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"kind" text NOT NULL,
	"membership_id" uuid,
	"pass_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"staff_id" uuid,
	"day" date NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_settings" ADD CONSTRAINT "auto_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_swaps" ADD CONSTRAINT "tire_swaps_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_swaps" ADD CONSTRAINT "tire_swaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_swaps" ADD CONSTRAINT "tire_swaps_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_swaps" ADD CONSTRAINT "tire_swaps_tire_set_id_tire_sets_id_fk" FOREIGN KEY ("tire_set_id") REFERENCES "public"."tire_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_nudges" ADD CONSTRAINT "vehicle_nudges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_nudges" ADD CONSTRAINT "vehicle_nudges_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_readings" ADD CONSTRAINT "vehicle_readings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_readings" ADD CONSTRAINT "vehicle_readings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_shop" ADD CONSTRAINT "vehicle_shop_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_shop" ADD CONSTRAINT "vehicle_shop_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_membership_id_class_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."class_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_pass_id_class_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."class_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash_visits" ADD CONSTRAINT "wash_visits_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tire_sets_merchant_idx" ON "tire_sets" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "tire_sets_user_idx" ON "tire_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tire_swaps_merchant_day_idx" ON "tire_swaps" USING btree ("merchant_id","day","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tire_swaps_live_uq" ON "tire_swaps" USING btree ("merchant_id","user_id","day") WHERE "tire_swaps"."status" = 'booked';--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_nudges_uq" ON "vehicle_nudges" USING btree ("merchant_id","vehicle_id","service_key","due_on");--> statement-breakpoint
CREATE INDEX "vehicle_readings_vehicle_idx" ON "vehicle_readings" USING btree ("vehicle_id","day");--> statement-breakpoint
CREATE INDEX "vehicle_services_idx" ON "vehicle_services" USING btree ("merchant_id","vehicle_id","service_key","done_on");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_shop_uq" ON "vehicle_shop" USING btree ("vehicle_id","merchant_id");--> statement-breakpoint
CREATE INDEX "vehicles_user_idx" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vehicles_plate_idx" ON "vehicles" USING btree ("plate_norm");--> statement-breakpoint
CREATE INDEX "wash_visits_merchant_idx" ON "wash_visits" USING btree ("merchant_id","day");--> statement-breakpoint
CREATE INDEX "wash_visits_user_idx" ON "wash_visits" USING btree ("user_id","merchant_id","day");