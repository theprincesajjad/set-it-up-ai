-- phase-pro P5: add-ons at booking (docs/business/pro-value.md §3.2 P5). An add-on is a services row with kind 'add_on' (no column change);
-- service_add_ons says which services offer it (no rows = every service).
CREATE TABLE "service_add_ons" (
	"merchant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"add_on_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_add_ons_service_id_add_on_id_pk" PRIMARY KEY("service_id","add_on_id")
);
--> statement-breakpoint
ALTER TABLE "service_add_ons" ADD CONSTRAINT "service_add_ons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_add_ons" ADD CONSTRAINT "service_add_ons_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_add_ons" ADD CONSTRAINT "service_add_ons_add_on_id_services_id_fk" FOREIGN KEY ("add_on_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_add_ons_merchant_idx" ON "service_add_ons" USING btree ("merchant_id","add_on_id");
