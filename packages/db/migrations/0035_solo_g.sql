-- phase-solo workstream G: the built-in website builder (sites, custom domains, AI usage log). docs/engineering/site-builder.md
CREATE TABLE "site_ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"outcome" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"registrar_ref" text,
	"verification" jsonb,
	"note" text,
	"live_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"preset" text NOT NULL,
	"content" jsonb NOT NULL,
	"published_content" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"domain" text,
	"domain_status" text DEFAULT 'none' NOT NULL,
	"ai_generations_period" integer DEFAULT 0 NOT NULL,
	"ai_edits_period" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"published_at" timestamp with time zone,
	"lapsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_ai_calls" ADD CONSTRAINT "site_ai_calls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_domains" ADD CONSTRAINT "site_domains_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_ai_calls_merchant_idx" ON "site_ai_calls" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "site_domains_merchant_idx" ON "site_domains" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_domains_hostname_uq" ON "site_domains" USING btree ("hostname") WHERE "site_domains"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "sites_merchant_uq" ON "sites" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "sites_domain_idx" ON "sites" USING btree ("domain");