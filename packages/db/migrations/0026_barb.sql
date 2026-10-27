CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferred_staff" (
	"user_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"staff_id" uuid,
	"source" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferred_staff_user_id_merchant_id_pk" PRIMARY KEY("user_id","merchant_id")
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid,
	"user_id" uuid,
	"family_member_id" uuid,
	"party_id" uuid,
	"name" text NOT NULL,
	"service_id" uuid,
	"service_name" text DEFAULT 'Cut' NOT NULL,
	"duration_min" integer DEFAULT 25 NOT NULL,
	"requested_staff_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"source" text DEFAULT 'join' NOT NULL,
	"token" text NOT NULL,
	"position_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_at" timestamp with time zone,
	"called_staff_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"appointment_id" uuid,
	"text_consent" boolean DEFAULT false NOT NULL,
	"notified_next_at" timestamp with time zone,
	"notified_called_at" timestamp with time zone,
	"skips" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_pay" (
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text DEFAULT 'employee' NOT NULL,
	"shop_share_bps" integer DEFAULT 0 NOT NULL,
	"rent_cents_week" integer DEFAULT 0 NOT NULL,
	"own_clients_only" boolean DEFAULT false NOT NULL,
	"takes_walk_ins" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_pay_merchant_id_user_id_pk" PRIMARY KEY("merchant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "walkin_queues" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"open" boolean DEFAULT false NOT NULL,
	"minutes_per_cut" integer DEFAULT 25 NOT NULL,
	"text_next" boolean DEFAULT true NOT NULL,
	"max_waiting" integer DEFAULT 30 NOT NULL,
	"call_hold_minutes" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferred_staff" ADD CONSTRAINT "preferred_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferred_staff" ADD CONSTRAINT "preferred_staff_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferred_staff" ADD CONSTRAINT "preferred_staff_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_requested_staff_id_users_id_fk" FOREIGN KEY ("requested_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_called_staff_id_users_id_fk" FOREIGN KEY ("called_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay" ADD CONSTRAINT "staff_pay_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay" ADD CONSTRAINT "staff_pay_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkin_queues" ADD CONSTRAINT "walkin_queues_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_members_user_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "preferred_staff_staff_idx" ON "preferred_staff" USING btree ("merchant_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_entries_token_uq" ON "queue_entries" USING btree ("token");--> statement-breakpoint
CREATE INDEX "queue_entries_merchant_status_idx" ON "queue_entries" USING btree ("merchant_id","status","position_at");--> statement-breakpoint
CREATE INDEX "queue_entries_user_idx" ON "queue_entries" USING btree ("user_id");